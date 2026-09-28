import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import WhatsappCall from '../models/whatsappCall.model.js';
import WhatsappMessage from '../models/whatsappMessage.model.js';
import WhatsappMessageDemand from '../models/whatsappMessageDemand.model.js';
import Lead from '../models/lead.model.js';
import Maker from '../models/maker.model.js';
import { getIO } from '../socket/socket.js';
import { fetchWhatsappMediaDownloadUrl } from '../utils/whatsappMediaUrl.js';
import { getFirebaseSignedUrl, uploadFirebaseObject } from '../config/firebase.js';

const GRAPH_VERSION = 'v21.0';
const RING_MS = 75_000;
const STALE_RING_MS = 90_000;
const TERMINAL = new Set(['rejected', 'missed', 'completed', 'failed']);
const CALL_DIR = path.join(process.cwd(), 'uploads', 'whatsapp-calls');

const LINES = {
  whatsapp: {
    tokenEnv: 'WHATSAPP_ACCESS_TOKEN',
    phoneIdEnv: 'WHATSAPP_PHONE_NUMBER_ID',
    MessageModel: WhatsappMessage,
    eventPrefix: 'whatsapp',
    apiPrefix: '/api/whatsapp',
  },
  'whatsapp-demand': {
    tokenEnv: 'WHATSAPP_ACCESS_TOKEN_DEMAND',
    phoneIdEnv: 'WHATSAPP_PHONE_NUMBER_ID_DEMAND',
    MessageModel: WhatsappMessageDemand,
    eventPrefix: 'whatsapp-demand',
    apiPrefix: '/api/whatsapp-demand',
  },
};

const actionLocks = new Map();
const ringTimers = new Map();

export class WhatsappCallError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function isValidObjectId(id) {
  if (!id || typeof id !== 'string') return false;
  return mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
}

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function last10(phone) {
  return digitsOnly(phone).slice(-10);
}

function normalizePhoneForStorage(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  const tail = digits.slice(-10);
  if (tail.length === 10) return `91${tail}`;
  return digits;
}

function phoneCandidates(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return [];
  const tail = digits.slice(-10);
  return Array.from(new Set([digits, tail, `91${tail}`, `910${tail}`, `0${tail}`]));
}

function credentials(line) {
  const cfg = LINES[line];
  if (!cfg) throw new WhatsappCallError('Unknown WhatsApp line', 500);
  return {
    ...cfg,
    token: process.env[cfg.tokenEnv] || '',
    phoneNumberId: process.env[cfg.phoneIdEnv] || '',
  };
}

function recordingPayload() {
  return {
    status: 'ENABLED',
    purpose: process.env.WHATSAPP_CALL_RECORDING_PURPOSE || 'quality assurance',
    announcement_language: process.env.WHATSAPP_CALL_RECORDING_LANGUAGE || 'en_US',
  };
}

function publicBase() {
  return (process.env.PUBLIC_BASE_URL || process.env.API_PUBLIC_URL || '').replace(/\/+$/, '');
}

function unixDate(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Date(n < 1e12 ? n * 1000 : n);
}

function isRecordingError(err) {
  const msg = `${err?.message || ''} ${JSON.stringify(err?.details || '')}`.toLowerCase();
  return msg.includes('record') || msg.includes('purpose') || msg.includes('announcement');
}

async function withCallLock(key, fn) {
  const lockKey = String(key || '');
  const prev = actionLocks.get(lockKey) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate);
  actionLocks.set(lockKey, tail);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (actionLocks.get(lockKey) === tail) actionLocks.delete(lockKey);
  }
}

async function latestAssignedExecutiveForPhone(phone, MessageModel) {
  const candidates = phoneCandidates(phone);
  if (!candidates.length) return null;
  const latestOutgoing = await MessageModel.findOne({
    phone: { $in: candidates },
    direction: 'outgoing',
    assignedTo: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select('assignedTo')
    .lean();
  return latestOutgoing?.assignedTo || null;
}

async function assignedUserIdFromLeadForPhone(phone) {
  const tail = last10(phone);
  if (!tail || tail.length !== 10) return null;
  const lead = await Lead.findOne({
    mobile: { $regex: new RegExp(`${tail}$`) },
    assignedUserId: { $ne: null },
  })
    .sort({ assignedAt: -1, updatedAt: -1, createdAt: -1 })
    .select('assignedUserId')
    .lean();
  return lead?.assignedUserId || null;
}

/** Same order as the chat webhooks: latest outgoing assignedTo, then lead owner. */
async function resolveAssignedExecutiveForPhone(phone, explicitAssignee, MessageModel) {
  if (isValidObjectId(String(explicitAssignee || ''))) return String(explicitAssignee);
  const fromMessages = await latestAssignedExecutiveForPhone(phone, MessageModel);
  if (fromMessages) return String(fromMessages);
  const fromLead = await assignedUserIdFromLeadForPhone(phone);
  if (fromLead) return String(fromLead);
  return null;
}

async function loadAssignee(id) {
  if (!id) return null;
  const maker = await Maker.findById(id).select('firstName lastName email').lean();
  if (!maker) return { _id: id, email: null, name: null };
  const name = [maker.firstName, maker.lastName].filter(Boolean).join(' ').trim() || null;
  return { _id: maker._id, email: maker.email || null, name };
}

function contactName(value, phone) {
  const want = last10(phone);
  const list = Array.isArray(value?.contacts) ? value.contacts : [];
  const hit = list.find((contact) => last10(contact?.wa_id) === want);
  return hit?.profile?.name ? String(hit.profile.name) : null;
}

function classifyCallEvent(call) {
  const event = String(call?.event || '').toLowerCase();
  if (event) return event;
  if (call?.audio || call?.recording) return 'call_recording_available';
  if (call?.duration != null || call?.end_time) return 'terminate';
  if (call?.session?.sdp) return 'connect';
  if (call?.status) return 'status';
  return '';
}

function directionOf(call) {
  return String(call?.direction || '').toUpperCase() === 'BUSINESS_INITIATED' ? 'outgoing' : 'incoming';
}

function customerPhoneFromCall(call, direction) {
  const raw = direction === 'outgoing' ? call?.to || call?.from : call?.from || call?.to;
  return normalizePhoneForStorage(raw);
}

function serializeCall(doc, { includeSdp = false, assignee = null } = {}) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const cfg = LINES[c.line];
  const token = c.recordingToken;
  const pathName = cfg && token ? `${cfg.apiPrefix}/calls/recording/${token}` : null;
  const base = publicBase();
  const assigned = assignee || (c.assignedTo ? { _id: c.assignedTo } : null);
  const payload = {
    _id: c._id,
    line: c.line,
    metaCallId: c.metaCallId || null,
    phone: c.phone || '',
    customerName: c.customerName || null,
    direction: c.direction,
    assignedTo: assigned,
    status: c.status,
    metaStatus: c.metaStatus || null,
    duration: c.duration ?? null,
    startedAt: c.startedAt || null,
    endedAt: c.endedAt || null,
    answeredAt: c.answeredAt || null,
    recordingStatus: c.recordingStatus || 'idle',
    recordingUrl: pathName ? `${base}${pathName}` : null,
    recordingStoragePath: c.recordingStoragePath || null,
    recordingMimeType: c.recordingMimeType || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };
  if (includeSdp) {
    payload.sdpOffer = c.sdpOffer || null;
    payload.sdpAnswer = c.sdpAnswer || null;
    payload.sdp = c.direction === 'outgoing' ? c.sdpAnswer || null : c.sdpOffer || null;
    payload.sdpType = c.direction === 'outgoing' ? (c.sdpAnswer ? 'answer' : null) : (c.sdpOffer ? 'offer' : null);
  }
  return payload;
}

async function present(doc, options = {}) {
  const assignee = await loadAssignee(doc.assignedTo);
  const payload = serializeCall(doc, { ...options, assignee });
  const storagePath = doc?.recordingStoragePath;
  if (payload.recordingStatus === 'ready' && storagePath) {
    try {
      const url = await getFirebaseSignedUrl(storagePath, doc.recordingBucket);
      if (url) payload.recordingUrl = url;
    } catch (err) {
      console.error('WhatsApp call recording URL:', err?.message || err);
    }
  }
  return payload;
}

function emitCall(line, assignedId, eventName, payload) {
  const io = getIO();
  if (!io || !assignedId) return;
  const prefix = LINES[line]?.eventPrefix || 'whatsapp';
  const name = `${prefix}:${eventName}`;
  const id = String(assignedId);
  io.to(`user:${id}`).emit(name, payload);
  io.to(`whatsapp:exec-notifications:${id}`).emit(name, payload);
}

function clearRingTimer(id) {
  const key = String(id);
  const timer = ringTimers.get(key);
  if (timer) clearTimeout(timer);
  ringTimers.delete(key);
}

function armRingTimer(id) {
  const key = String(id);
  if (ringTimers.has(key)) return;
  const timer = setTimeout(() => {
    ringTimers.delete(key);
    markMissedIfStillRinging(key).catch((err) => {
      console.error('WhatsApp call missed timer:', err?.message || err);
    });
  }, RING_MS);
  if (typeof timer.unref === 'function') timer.unref();
  ringTimers.set(key, timer);
}

async function markMissedIfStillRinging(id) {
  const endedAt = new Date();
  let call = await WhatsappCall.findOneAndUpdate(
    { _id: id, status: { $in: ['ringing', 'pre_accepted'] } },
    { $set: { status: 'missed', endedAt } },
    { new: true }
  );
  if (!call) {
    call = await WhatsappCall.findOneAndUpdate(
      { _id: id, status: 'starting' },
      { $set: { status: 'failed', endedAt } },
      { new: true }
    );
  }
  if (!call) return;
  if (call.metaCallId && call.status === 'missed') {
    graphCallAction(call.line, { call_id: call.metaCallId, action: 'reject' }).catch((err) => {
      console.error('WhatsApp reject timed-out call:', err?.message || err);
    });
  }
  const payload = await present(call);
  emitCall(call.line, call.assignedTo, 'call:ended', payload);
}

async function graphCallAction(line, body) {
  const { token, phoneNumberId } = credentials(line);
  if (!token || !phoneNumberId) {
    throw new WhatsappCallError('WhatsApp calling is not configured for this line', 500);
  }
  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsappCallError(
      data?.error?.message || 'WhatsApp call request failed',
      response.status || 502,
      data?.error || data
    );
  }
  return data;
}

async function graphCallActionWithRecording(line, body) {
  try {
    const data = await graphCallAction(line, { ...body, recording: recordingPayload() });
    return { data, recorded: true };
  } catch (err) {
    if (!isRecordingError(err)) throw err;
    console.error('WhatsApp call recording was rejected, continuing without it:', err.message);
    const data = await graphCallAction(line, body);
    return { data, recorded: false };
  }
}

function metaCallIdFromResponse(data) {
  return data?.calls?.[0]?.id || data?.id || data?.call_id || null;
}

function assertExecutive(call, executiveId) {
  if (!isValidObjectId(String(executiveId || ''))) {
    throw new WhatsappCallError('executiveId is required', 400);
  }
  if (!call.assignedTo) {
    throw new WhatsappCallError('No executive is assigned to this customer on this line', 409);
  }
  if (String(call.assignedTo) !== String(executiveId)) {
    throw new WhatsappCallError('This call belongs to another executive', 403);
  }
}

async function findCallOnLine(line, { callId, metaCallId }) {
  if (isValidObjectId(String(callId || ''))) {
    const byId = await WhatsappCall.findOne({ _id: callId, line });
    if (byId) return byId;
  }
  if (metaCallId) return WhatsappCall.findOne({ metaCallId: String(metaCallId), line });
  return null;
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg')) return '.mp3';
  if (mime.includes('mp4') || mime.includes('m4a')) return '.m4a';
  if (mime.includes('wav')) return '.wav';
  return '.ogg';
}

function hashMatches(buffer, expected) {
  if (!expected) return true;
  const hex = crypto.createHash('sha256').update(buffer).digest('hex');
  const b64 = crypto.createHash('sha256').update(buffer).digest('base64');
  return expected === hex || expected === b64;
}

async function readAuthorizedAudio(url, token) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const mime = response.headers.get('content-type') || '';
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) return null;
  return { buffer, mime };
}

async function downloadCallRecording(callId) {
  const call = await WhatsappCall.findById(callId);
  if (!call || call.recordingStatus === 'ready') return;
  const { token } = credentials(call.line);
  let audio = null;
  if (call.recordingMediaId && token) {
    const mediaUrl = await fetchWhatsappMediaDownloadUrl(call.recordingMediaId, token);
    if (mediaUrl) audio = await readAuthorizedAudio(mediaUrl, token);
  }
  if (!audio && call.recordingSourceUrl && token) {
    audio = await readAuthorizedAudio(call.recordingSourceUrl, token);
  }
  if (!audio) {
    call.recordingStatus = 'failed';
    await call.save();
    emitCall(call.line, call.assignedTo, 'call:recording', await present(call));
    return;
  }

  const fileToken = crypto.randomBytes(32).toString('hex');
  const ext = extensionForMime(audio.mime || call.recordingMimeType);
  const mimeType = (audio.mime || call.recordingMimeType || 'audio/ogg').split(';')[0].trim();
  const objectPath = `whatsapp-calls/${call.line}/${fileToken}${ext}`;
  try {
    const uploaded = await uploadFirebaseObject({
      objectPath,
      buffer: audio.buffer,
      contentType: mimeType,
      downloadToken: fileToken,
    });
    call.recordingStatus = 'ready';
    call.recordingFilename = `${fileToken}${ext}`;
    call.recordingToken = fileToken;
    call.recordingStoragePath = uploaded.objectPath;
    call.recordingBucket = uploaded.bucket;
    call.recordingMimeType = mimeType;
    call.recordingHashOk = hashMatches(audio.buffer, call.recordingSha256);
    call.recordingSourceUrl = null;
    await call.save();
  } catch (err) {
    console.error('WhatsApp call recording Firebase upload:', err?.message || err);
    call.recordingStatus = 'failed';
    await call.save();
  }
  emitCall(call.line, call.assignedTo, 'call:recording', await present(call));
}

async function onConnect(line, call, value) {
  const metaCallId = call?.id ? String(call.id) : '';
  if (!metaCallId) return;
  const direction = directionOf(call);
  const phone = customerPhoneFromCall(call, direction);
  const cfg = credentials(line);
  const existing = await WhatsappCall.findOne({ metaCallId });
  if (existing && existing.line !== line) return;
  if (existing && TERMINAL.has(existing.status)) return;

  const opaque = isValidObjectId(String(call.biz_opaque_callback_data || ''))
    ? String(call.biz_opaque_callback_data)
    : null;
  let assignedTo = existing?.assignedTo || null;
  if (!assignedTo) {
    assignedTo =
      direction === 'outgoing'
        ? opaque || (await resolveAssignedExecutiveForPhone(phone, null, cfg.MessageModel))
        : await resolveAssignedExecutiveForPhone(phone, null, cfg.MessageModel);
  }

  const sdp = call.session?.sdp ? String(call.session.sdp) : null;
  const sdpType = String(call.session?.sdp_type || '').toLowerCase();
  const name = contactName(value, phone);

  const doc =
    existing ||
    new WhatsappCall({
      line,
      metaCallId,
      direction,
      status: 'ringing',
    });

  doc.line = line;
  doc.metaCallId = metaCallId;
  doc.phone = doc.phone || phone;
  doc.customerName = doc.customerName || name;
  doc.direction = doc.direction || direction;
  if (!doc.assignedTo && assignedTo) doc.assignedTo = assignedTo;
  if (sdp && (sdpType === 'answer' || direction === 'outgoing')) doc.sdpAnswer = sdp;
  else if (sdp) doc.sdpOffer = sdp;
  if (!doc.status || doc.status === 'starting') doc.status = 'ringing';
  await doc.save();

  if (direction === 'incoming' && !doc.assignedTo) {
    doc.status = 'missed';
    doc.endedAt = new Date();
    await doc.save();
    graphCallAction(line, { call_id: metaCallId, action: 'reject' }).catch((err) => {
      console.error('WhatsApp reject unassigned call:', err?.message || err);
    });
    return;
  }

  const includeSdp = true;
  const payload = await present(doc, { includeSdp });
  if (direction === 'outgoing') {
    emitCall(line, doc.assignedTo, 'call:updated', payload);
    return;
  }

  if (!doc.notifiedAt) {
    doc.notifiedAt = new Date();
    await doc.save();
    emitCall(line, doc.assignedTo, 'call:incoming', payload);
    armRingTimer(doc._id);
  }
}

async function onStatus(line, call) {
  const metaCallId = call?.id ? String(call.id) : '';
  if (!metaCallId) return;
  const doc = await WhatsappCall.findOne({ metaCallId, line });
  if (!doc || TERMINAL.has(doc.status)) return;
  const metaStatus = String(call.status || '').toUpperCase();
  doc.metaStatus = metaStatus || doc.metaStatus;
  if (metaStatus === 'ACCEPTED' && doc.status !== 'accepted') {
    doc.status = 'accepted';
    doc.answeredAt = doc.answeredAt || unixDate(call.timestamp) || new Date();
    clearRingTimer(doc._id);
  } else if (metaStatus === 'REJECTED') {
    doc.status = 'rejected';
    doc.endedAt = doc.endedAt || new Date();
    clearRingTimer(doc._id);
  }
  await doc.save();
  const eventName = TERMINAL.has(doc.status) ? 'call:ended' : 'call:updated';
  emitCall(line, doc.assignedTo, eventName, await present(doc, { includeSdp: true }));
}

async function onTerminate(line, call) {
  const metaCallId = call?.id ? String(call.id) : '';
  if (!metaCallId) return;
  let doc = await WhatsappCall.findOne({ metaCallId });
  if (doc && doc.line !== line) return;
  const direction = directionOf(call);
  const phone = customerPhoneFromCall(call, direction);
  if (!doc) {
    doc = new WhatsappCall({
      line,
      metaCallId,
      phone,
      direction,
      status: 'missed',
    });
  }

  const metaStatus = String(call.status || '').toUpperCase();
  const duration = Number(call.duration);
  const hasDuration = Number.isFinite(duration) && duration >= 0 && call.duration != null;
  doc.metaStatus = metaStatus || doc.metaStatus;
  doc.phone = doc.phone || phone;
  doc.startedAt = doc.startedAt || unixDate(call.start_time);
  doc.endedAt = unixDate(call.end_time) || doc.endedAt || new Date();
  if (hasDuration) doc.duration = duration;
  if (Array.isArray(call.errors) && call.errors.length) doc.metaErrors = call.errors;

  const wasAnswered = Boolean(doc.answeredAt) || doc.status === 'accepted' || doc.status === 'completed';
  const metaCompleted = (hasDuration && duration > 0) || metaStatus === 'COMPLETED';
  if (wasAnswered || metaCompleted) {
    doc.status = 'completed';
    if (!hasDuration && doc.answeredAt && doc.endedAt && doc.duration == null) {
      doc.duration = Math.max(0, Math.round((doc.endedAt.getTime() - new Date(doc.answeredAt).getTime()) / 1000));
    }
  } else if (!TERMINAL.has(doc.status)) {
    if (metaStatus === 'REJECTED') doc.status = 'rejected';
    else if (metaStatus === 'FAILED') doc.status = 'failed';
    else doc.status = 'missed';
  }

  clearRingTimer(doc._id);
  await doc.save();
  emitCall(line, doc.assignedTo, 'call:ended', await present(doc));
}

function recordingFields(call) {
  const audio = call?.audio || call?.recording?.audio || null;
  if (!audio || typeof audio !== 'object') return null;
  return {
    mediaId: audio.id ? String(audio.id) : null,
    url: audio.url ? String(audio.url) : null,
    mimeType: audio.mime_type ? String(audio.mime_type) : null,
    sha256: audio.sha256 ? String(audio.sha256) : null,
  };
}

async function onRecording(line, call) {
  const metaCallId = call?.id ? String(call.id) : '';
  const audio = recordingFields(call);
  if (!metaCallId || !audio) return;
  let doc = await WhatsappCall.findOne({ metaCallId });
  if (doc && doc.line !== line) return;
  if (!doc) {
    doc = new WhatsappCall({
      line,
      metaCallId,
      direction: 'incoming',
      status: 'completed',
      phone: '',
    });
  }
  if (doc.recordingStatus === 'ready') return;
  doc.recordingMediaId = audio.mediaId || doc.recordingMediaId;
  doc.recordingSourceUrl = audio.url || doc.recordingSourceUrl;
  doc.recordingMimeType = audio.mimeType || doc.recordingMimeType;
  doc.recordingSha256 = audio.sha256 || doc.recordingSha256;
  doc.recordingStatus = 'pending';
  await doc.save();
  downloadCallRecording(doc._id).catch((err) => {
    console.error('WhatsApp call recording download:', err?.message || err);
  });
}

function isCallStatusEntry(status) {
  const kind = String(status?.type || '').toLowerCase();
  const name = String(status?.status || '').toUpperCase();
  return kind === 'call' || name === 'RINGING' || name === 'ACCEPTED' || name === 'REJECTED';
}

export function webhookHasCallPayload(value) {
  if (Array.isArray(value?.calls) && value.calls.length) return true;
  return Array.isArray(value?.statuses) && value.statuses.some(isCallStatusEntry);
}

export async function handleWhatsappCallWebhook(line, value) {
  const { phoneNumberId } = credentials(line);
  const incomingPhoneId = value?.metadata?.phone_number_id;
  if (incomingPhoneId && phoneNumberId && String(incomingPhoneId) !== String(phoneNumberId)) {
    console.error('WhatsApp call webhook ignored: phone_number_id does not match this line', line);
    return;
  }
  const calls = Array.isArray(value?.calls) ? value.calls : [];
  for (const call of calls) {
    const event = classifyCallEvent(call);
    if (event === 'connect') await onConnect(line, call, value);
    else if (event === 'terminate') await onTerminate(line, call);
    else if (event === 'call_recording_available' || event === 'recording_available') await onRecording(line, call);
    else if (event === 'status') await onStatus(line, call);
    else console.log('WhatsApp call webhook event skipped:', event || '(empty)');
  }

  const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
  for (const status of statuses) {
    if (!isCallStatusEntry(status) || !status?.id) continue;
    await onStatus(line, {
      id: status.id,
      status: status.status,
      timestamp: status.timestamp,
      from: status.recipient_id,
      to: status.recipient_id,
    });
  }
}

export async function getCallPermission(line, phone) {
  const { token, phoneNumberId } = credentials(line);
  if (!token || !phoneNumberId) {
    throw new WhatsappCallError('WhatsApp calling is not configured for this line', 500);
  }
  const user = normalizePhoneForStorage(phone);
  if (!user) throw new WhatsappCallError('phone is required', 400);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/call_permissions?user_wa_id=${encodeURIComponent(user)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new WhatsappCallError(data?.error?.message || 'Could not read call permission', response.status || 502, data?.error || data);
  }
  return data;
}

function permissionBlocksOutgoing(data) {
  const status = String(data?.permission?.status || '').toLowerCase();
  if (status === 'no_permission') return true;
  const actions = Array.isArray(data?.actions) ? data.actions : [];
  const start = actions.find((item) => String(item?.action_name || item?.name || '').toLowerCase() === 'start_call');
  return Boolean(start && start.can_perform_action === false);
}

export async function connectOutgoingCall(line, { phone, sdp, executiveId }) {
  if (!sdp || !String(sdp).trim()) throw new WhatsappCallError('sdp offer is required', 400);
  if (!isValidObjectId(String(executiveId || ''))) throw new WhatsappCallError('executiveId is required', 400);
  const to = normalizePhoneForStorage(phone);
  if (!to) throw new WhatsappCallError('phone is required', 400);

  const owner = await resolveAssignedExecutiveForPhone(to, null, credentials(line).MessageModel);
  if (owner && String(owner) !== String(executiveId)) {
    throw new WhatsappCallError('This customer is assigned to another executive', 403);
  }

  try {
    const permission = await getCallPermission(line, to);
    if (permissionBlocksOutgoing(permission)) {
      throw new WhatsappCallError('Customer has not allowed a call on this WhatsApp number', 403, permission);
    }
  } catch (err) {
    if (err instanceof WhatsappCallError && err.status === 403) throw err;
    console.error('WhatsApp call permission check skipped:', err?.message || err);
  }

  const local = await WhatsappCall.create({
    line,
    phone: to,
    direction: 'outgoing',
    assignedTo: executiveId,
    status: 'starting',
    sdpOffer: String(sdp),
    recordingStatus: 'pending',
  });

  let recorded = true;
  let data;
  try {
    const result = await graphCallActionWithRecording(line, {
      to,
      action: 'connect',
      session: { sdp_type: 'offer', sdp: String(sdp) },
      biz_opaque_callback_data: String(executiveId),
    });
    data = result.data;
    recorded = result.recorded;
  } catch (err) {
    local.status = 'failed';
    local.metaErrors = err.details || { message: err.message };
    local.recordingStatus = 'unavailable';
    await local.save();
    throw err;
  }

  const metaCallId = metaCallIdFromResponse(data);
  local.recordingStatus = recorded ? 'pending' : 'unavailable';
  if (!metaCallId) {
    local.status = 'ringing';
    await local.save();
    return present(local, { includeSdp: true });
  }

  const raced = await WhatsappCall.findOne({ metaCallId, _id: { $ne: local._id } });
  if (raced) {
    if (!raced.assignedTo) raced.assignedTo = executiveId;
    if (!raced.sdpOffer) raced.sdpOffer = String(sdp);
    if (!raced.phone) raced.phone = to;
    raced.recordingStatus = recorded ? raced.recordingStatus || 'pending' : 'unavailable';
    await raced.save();
    await WhatsappCall.deleteOne({ _id: local._id });
    const racedPayload = await present(raced, { includeSdp: true });
    if (raced.sdpAnswer) emitCall(line, raced.assignedTo, 'call:updated', racedPayload);
    return racedPayload;
  }

  local.metaCallId = String(metaCallId);
  local.status = 'ringing';
  try {
    await local.save();
  } catch (err) {
    if (err?.code !== 11000) throw err;
    const winner = await WhatsappCall.findOne({ metaCallId: String(metaCallId) });
    if (!winner) throw err;
    if (!winner.assignedTo) winner.assignedTo = executiveId;
    if (!winner.sdpOffer) winner.sdpOffer = String(sdp);
    if (!winner.phone) winner.phone = to;
    await winner.save();
    await WhatsappCall.deleteOne({ _id: local._id });
    const winnerPayload = await present(winner, { includeSdp: true });
    if (winner.sdpAnswer) emitCall(line, winner.assignedTo, 'call:updated', winnerPayload);
    return winnerPayload;
  }
  return present(local, { includeSdp: true });
}

export async function preAcceptCall(line, { callId, metaCallId, sdp, executiveId }) {
  if (!sdp || !String(sdp).trim()) throw new WhatsappCallError('sdp answer is required', 400);
  const key = metaCallId || callId;
  return withCallLock(key, async () => {
    const call = await findCallOnLine(line, { callId, metaCallId });
    if (!call) throw new WhatsappCallError('Call not found', 404);
    if (!call.metaCallId) throw new WhatsappCallError('Call is not ready yet', 409);
    assertExecutive(call, executiveId);
    if (TERMINAL.has(call.status)) throw new WhatsappCallError('This call has already ended', 409);
    if (call.status === 'pre_accepted' || call.status === 'accepted') {
      return present(call, { includeSdp: true });
    }
    await graphCallAction(line, {
      call_id: call.metaCallId,
      action: 'pre_accept',
      session: { sdp_type: 'answer', sdp: String(sdp) },
    });
    call.sdpAnswer = String(sdp);
    call.status = 'pre_accepted';
    await call.save();
    const payload = await present(call, { includeSdp: true });
    emitCall(line, call.assignedTo, 'call:updated', payload);
    return payload;
  });
}

export async function acceptCall(line, { callId, metaCallId, sdp, executiveId }) {
  const key = metaCallId || callId;
  return withCallLock(key, async () => {
    const call = await findCallOnLine(line, { callId, metaCallId });
    if (!call) throw new WhatsappCallError('Call not found', 404);
    if (!call.metaCallId) throw new WhatsappCallError('Call is not ready yet', 409);
    assertExecutive(call, executiveId);
    if (call.status === 'accepted') return present(call, { includeSdp: true });
    if (TERMINAL.has(call.status)) throw new WhatsappCallError('This call has already ended', 409);
    const stored = String(call.sdpAnswer || '').trim();
    const incoming = String(sdp || '').trim();
    // Pre-accept already gave WhatsApp one answer. A later Pick from another
    // tab sends a new SDP; Meta will only take the first one.
    const answer = stored || incoming;
    if (!answer) throw new WhatsappCallError('sdp answer is required', 400);

    const result = await graphCallActionWithRecording(line, {
      call_id: call.metaCallId,
      action: 'accept',
      session: { sdp_type: 'answer', sdp: answer },
    });
    call.sdpAnswer = answer;
    call.status = 'accepted';
    call.answeredAt = call.answeredAt || new Date();
    call.recordingStatus = result.recorded ? 'pending' : 'unavailable';
    clearRingTimer(call._id);
    await call.save();
    const payload = await present(call, { includeSdp: true });
    emitCall(line, call.assignedTo, 'call:updated', payload);
    return payload;
  });
}

export async function rejectCall(line, { callId, metaCallId, executiveId }) {
  const key = metaCallId || callId;
  return withCallLock(key, async () => {
    const call = await findCallOnLine(line, { callId, metaCallId });
    if (!call) throw new WhatsappCallError('Call not found', 404);
    if (!call.metaCallId) throw new WhatsappCallError('Call is not ready yet', 409);
    assertExecutive(call, executiveId);
    if (TERMINAL.has(call.status)) return present(call);
    try {
      await graphCallAction(line, { call_id: call.metaCallId, action: 'reject' });
    } catch (err) {
      console.error('WhatsApp reject call:', err?.message || err);
    }
    call.status = 'rejected';
    call.endedAt = call.endedAt || new Date();
    clearRingTimer(call._id);
    await call.save();
    const payload = await present(call);
    emitCall(line, call.assignedTo, 'call:ended', payload);
    return payload;
  });
}

export async function terminateCall(line, { callId, metaCallId, executiveId }) {
  const key = metaCallId || callId;
  return withCallLock(key, async () => {
    const call = await findCallOnLine(line, { callId, metaCallId });
    if (!call) throw new WhatsappCallError('Call not found', 404);
    if (!call.metaCallId) throw new WhatsappCallError('Call is not ready yet', 409);
    assertExecutive(call, executiveId);
    if (!TERMINAL.has(call.status)) {
      try {
        await graphCallAction(line, { call_id: call.metaCallId, action: 'terminate' });
      } catch (err) {
        console.error('WhatsApp terminate call:', err?.message || err);
      }
      call.endedAt = call.endedAt || new Date();
      if (call.answeredAt) {
        call.status = 'completed';
        if (call.duration == null) {
          call.duration = Math.max(0, Math.round((call.endedAt.getTime() - call.answeredAt.getTime()) / 1000));
        }
      } else {
        call.status = 'missed';
      }
      clearRingTimer(call._id);
      await call.save();
    }
    const payload = await present(call);
    emitCall(line, call.assignedTo, 'call:ended', payload);
    return payload;
  });
}

export async function listCallsByPhone(line, phone, limit = 50) {
  const candidates = phoneCandidates(phone);
  if (!candidates.length) throw new WhatsappCallError('Invalid phone', 400);
  const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const rows = await WhatsappCall.find({ line, phone: { $in: candidates } })
    .sort({ createdAt: -1 })
    .limit(capped)
    .lean();
  return Promise.all(rows.map((row) => present(row)));
}

export async function listActiveCalls(line, executiveId) {
  if (!isValidObjectId(String(executiveId || ''))) throw new WhatsappCallError('executiveId is required', 400);
  const rows = await WhatsappCall.find({
    line,
    assignedTo: executiveId,
    status: { $in: ['ringing', 'pre_accepted', 'accepted', 'starting'] },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  const visible = [];
  for (const row of rows) {
    const age = Date.now() - new Date(row.createdAt).getTime();
    if ((row.status === 'ringing' || row.status === 'pre_accepted' || row.status === 'starting') && age > STALE_RING_MS) {
      await markMissedIfStillRinging(row._id);
      continue;
    }
    visible.push(await present(row, { includeSdp: true }));
  }
  return visible;
}

export async function getCall(line, callId) {
  const call = await findCallOnLine(line, { callId, metaCallId: callId });
  if (!call) throw new WhatsappCallError('Call not found', 404);
  const live = ['ringing', 'pre_accepted', 'accepted', 'starting'].includes(call.status);
  return present(call, { includeSdp: live });
}

export async function recordingFileForToken(token) {
  const clean = String(token || '').replace(/[^a-f0-9]/gi, '');
  if (clean.length !== 64) return null;
  const call = await WhatsappCall.findOne({ recordingToken: clean }).lean();
  if (!call) return null;
  if (call.recordingStoragePath) {
    const redirectUrl = await getFirebaseSignedUrl(call.recordingStoragePath, call.recordingBucket);
    if (redirectUrl) return { redirectUrl };
  }
  if (!call.recordingFilename) return null;
  const filePath = path.resolve(CALL_DIR, path.basename(call.recordingFilename));
  const relative = path.relative(CALL_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(filePath)) return null;
  return { filePath, mimeType: call.recordingMimeType || 'audio/ogg' };
}

export async function pushActiveCallsToUser(userId) {
  if (!isValidObjectId(String(userId || ''))) return;
  const rows = await WhatsappCall.find({
    assignedTo: userId,
    status: { $in: ['ringing', 'pre_accepted', 'accepted'] },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  for (const row of rows) {
    const age = Date.now() - new Date(row.createdAt).getTime();
    if ((row.status === 'ringing' || row.status === 'pre_accepted') && age > STALE_RING_MS) {
      await markMissedIfStillRinging(row._id);
      continue;
    }
    const incoming = row.status === 'ringing' || row.status === 'pre_accepted';
    const payload = await present(row, { includeSdp: true });
    emitCall(row.line, userId, incoming ? 'call:incoming' : 'call:updated', payload);
  }
}
