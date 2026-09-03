import crypto from 'crypto';
import OpenAI from 'openai';
import Maker from '../models/maker.model.js';
import AiConversation from '../models/aiConversation.model.js';
import AiUsage from '../models/aiUsage.model.js';
import { errorHandler } from '../utils/error.js';
import {
  AI_LEAD_TOOLS,
  executeLeadTool,
  compactToolPayload,
  istCalendarLabels,
} from '../services/aiLeadTools.service.js';

const HISTORY_LIMIT = 8;
const MAX_TOOL_ROUNDS = 3;
const PENDING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DAILY_LIMIT = 40;
const DEFAULT_MODEL = 'gpt-4.1-mini';

function buildSystemPrompt() {
  const { today, yesterday } = istCalendarLabels();
  return `You are the Pluto CRM Lead Assistant.
You only help with leads the logged-in user can access. The server already scopes data:
- Executive: own created or assigned leads.
- Admin/manager: assigned leads (isAssignedLead true) for their company only (publish ptw or demand). PTW and Demand never mix.
Use tools for any fact about leads. Never invent leadId, mobile, amounts, or counts.
Today's date is ${today} (IST, Asia/Kolkata). Yesterday is ${yesterday}.
Never use any other "today/yesterday" from training data.
For "aaj/kal/yesterday/today kitni leads" on the Assigned Leads tab, use assignedToday / assignedYesterday / assignedOn (field assignedAt). That matches the admin Date filter.
If the user says create / bani / created, use createdToday / createdYesterday / createdOn (field createdAt).
Pass calendar days as YYYY-MM-DD. Use countOnly true for count questions. The server expands them to a full IST day. Do not pass an open-ended from-date.
If search returns 0 leads, say not found. If multiple people match, ask which leadId / id.
To find an executive's leads, pass assignedUserName.
Create/update/delete: call the tool only when required fields are present. The server will ask the user to confirm before saving.
Never try bulk delete or "delete all".
Reply in the same language the user used (Hindi or English). Keep answers short. Prefer a compact list: leadId, name, mobile, destination, status.
When stating a count, also state the IST date and whether it is assignedAt or createdAt.
Do not mention tools, Mongo, or internal ids unless the user needs the id to confirm an action.`;
}

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({
    apiKey,
    timeout: 40000,
    maxRetries: 1,
  });
}

function istDateKey() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function dailyLimit() {
  const n = Number(process.env.AI_DAILY_LIMIT_PER_USER);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_LIMIT;
}

function trimMessages(messages) {
  if (messages.length <= 40) return messages;
  return messages.slice(-40);
}

function historyForModel(messages = []) {
  return messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role,
    content: m.content || '',
  }));
}

function pendingExpired(pending) {
  if (!pending?.createdAt) return true;
  return Date.now() - new Date(pending.createdAt).getTime() > PENDING_TTL_MS;
}

function wantsConfirm(body) {
  if (body.confirm === true) return true;
  if (body.confirmAction && body.confirmAction.confirm !== false) return true;
  const msg = String(body.message || '').trim().toLowerCase();
  return msg === 'confirm' || msg === 'yes' || msg === 'haan' || msg === 'ha';
}

function wantsCancel(body) {
  if (body.confirm === false) return true;
  if (body.confirmAction?.confirm === false) return true;
  const msg = String(body.message || '').trim().toLowerCase();
  return msg === 'cancel' || msg === 'no' || msg === 'nahi' || msg === 'na';
}

function confirmTokenFromBody(body) {
  return (
    body.confirmToken ||
    body.confirmAction?.confirmToken ||
    body.confirmAction?.token ||
    null
  );
}

function jsonSafeParse(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function classifyReply(text, hadToolResult) {
  if (!hadToolResult && /\?\s*$/m.test(String(text || '').trim())) {
    return 'need_more';
  }
  return 'answer';
}

async function consumeQuota(userId) {
  const date = istDateKey();
  const limit = dailyLimit();
  const usage = await AiUsage.findOne({ userId, date }).lean();
  if (usage && usage.count >= limit) {
    return { allowed: false, remaining: 0, limit };
  }
  const updated = await AiUsage.findOneAndUpdate(
    { userId, date },
    { $inc: { count: 1 } },
    { upsert: true, new: true }
  );
  if (updated.count > limit) {
    await AiUsage.updateOne({ userId, date }, { $inc: { count: -1 } });
    return { allowed: false, remaining: 0, limit };
  }
  return { allowed: true, remaining: Math.max(0, limit - updated.count), limit };
}

async function loadConversation(userId, conversationId) {
  const id = conversationId || crypto.randomUUID();
  let doc = await AiConversation.findOne({ conversationId: id, userId });
  if (!doc) {
    doc = await AiConversation.create({
      conversationId: id,
      userId,
      messages: [],
    });
  }
  return doc;
}

function buildPreviewText(tool, preview = {}) {
  const who = [preview.leadId, preview.name, preview.mobile].filter(Boolean).join(' · ');
  if (tool === 'create_lead') {
    return `Yeh lead create karun?\nName: ${preview.name || '-'}\nMobile: ${preview.mobile || '-'}\nDestination: ${preview.destination || '-'}\nBudget: ${preview.budget || '-'}`;
  }
  if (tool === 'update_lead') {
    return `Yeh lead update karun${who ? `: ${who}` : ''}?\nConfirm ke baad hi save hoga.`;
  }
  if (tool === 'delete_lead') {
    return `Yeh lead delete karun${who ? `: ${who}` : ''}?\nWapas nahi aayegi.`;
  }
  return 'Confirm this action?';
}

async function applyWriteResult(conversation, userId, maker, pending) {
  const result = await executeLeadTool(pending.tool, pending.args, {
    user: { id: userId },
    maker,
    executeWrites: true,
  });
  const data = result.data || {};
  conversation.pendingAction = null;
  const text = data.ok === false
    ? (data.message || 'Action failed')
    : (data.message || 'Done');
  const leads = data.lead ? [data.lead] : data.leads || undefined;
  conversation.messages.push({
    role: 'assistant',
    content: text,
    type: data.ok === false ? 'error' : 'answer',
  });
  conversation.messages = trimMessages(conversation.messages);
  await conversation.save();
  return {
    type: data.ok === false ? 'error' : 'answer',
    conversationId: conversation.conversationId,
    text,
    leads,
    pendingAction: null,
  };
}

export const overview = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return next(errorHandler(401, 'User not authenticated'));
    }

    const client = getClient();
    if (!client) {
      return res.status(503).json({
        type: 'error',
        message: 'AI is not configured. Add OPENAI_API_KEY in .env',
      });
    }

    const userId = req.user.id;
    const maker = await Maker.findById(userId)
      .select('firstName lastName companyName userType designation teamLeaderId managerId')
      .lean();

    const conversation = await loadConversation(userId, req.body?.conversationId);
    const body = req.body || {};

    if (conversation.pendingAction && pendingExpired(conversation.pendingAction)) {
      conversation.pendingAction = null;
      await conversation.save();
    }

    if (conversation.pendingAction && wantsCancel(body)) {
      conversation.pendingAction = null;
      conversation.messages.push({
        role: 'assistant',
        content: 'Cancelled. Aur kuch?',
        type: 'answer',
      });
      await conversation.save();
      return res.status(200).json({
        type: 'answer',
        conversationId: conversation.conversationId,
        text: 'Cancelled. Aur kuch?',
        pendingAction: null,
      });
    }

    if (conversation.pendingAction && wantsConfirm(body)) {
      const token = confirmTokenFromBody(body);
      if (token && token !== conversation.pendingAction.confirmToken) {
        return res.status(400).json({
          type: 'error',
          conversationId: conversation.conversationId,
          text: 'Confirm token mismatch. Action cancelled.',
          pendingAction: null,
        });
      }
      const payload = await applyWriteResult(
        conversation,
        userId,
        maker,
        conversation.pendingAction
      );
      return res.status(200).json(payload);
    }

    const message = String(body.message || '').trim();
    if (!message) {
      return res.status(400).json({
        type: 'error',
        conversationId: conversation.conversationId,
        text: 'message is required',
      });
    }

    const quota = await consumeQuota(userId);
    if (!quota.allowed) {
      return res.status(429).json({
        type: 'error',
        conversationId: conversation.conversationId,
        text: 'Aaj ki AI limit khatam ho gayi. Kal try karo.',
        dailyRemaining: 0,
      });
    }

    conversation.pendingAction = null;
    conversation.messages.push({ role: 'user', content: message, type: 'answer' });

    const modelMessages = [
      { role: 'system', content: buildSystemPrompt() },
      ...historyForModel(conversation.messages),
    ];

    let hadToolResult = false;
    let confirmPayload = null;
    let assistantText = '';

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        tools: AI_LEAD_TOOLS,
        tool_choice: 'auto',
        messages: modelMessages,
      });

      const choice = completion.choices?.[0];
      const assistantMessage = choice?.message;
      if (!assistantMessage) break;

      const toolCalls = assistantMessage.tool_calls || [];
      if (!toolCalls.length) {
        assistantText = (assistantMessage.content || '').trim();
        break;
      }

      modelMessages.push({
        role: 'assistant',
        content: assistantMessage.content || '',
        tool_calls: toolCalls,
      });

      let stopForConfirm = false;
      for (const call of toolCalls) {
        const name = call.function?.name;
        const args = jsonSafeParse(call.function?.arguments);
        const toolResult = await executeLeadTool(name, args, {
          user: req.user,
          maker,
          executeWrites: false,
        });

        if (toolResult.kind === 'confirm') {
          confirmPayload = toolResult;
          stopForConfirm = true;
          break;
        }

        hadToolResult = true;
        modelMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: compactToolPayload(toolResult.data || { ok: false }),
        });
      }

      if (stopForConfirm) break;
    }

    if (confirmPayload) {
      let preview = confirmPayload.preview || {};
      if (confirmPayload.tool !== 'create_lead' && confirmPayload.args?.id) {
        const found = await executeLeadTool('get_lead', { id: confirmPayload.args.id }, {
          user: req.user,
          maker,
          executeWrites: false,
        });
        if (found.data?.lead) {
          preview = { ...preview, ...found.data.lead };
        }
      }
      const confirmToken = crypto.randomBytes(16).toString('hex');
      conversation.pendingAction = {
        tool: confirmPayload.tool,
        args: confirmPayload.args,
        confirmToken,
        preview,
        createdAt: new Date(),
      };
      const text = buildPreviewText(confirmPayload.tool, preview);
      conversation.messages.push({ role: 'assistant', content: text, type: 'confirm' });
      conversation.messages = trimMessages(conversation.messages);
      await conversation.save();
      return res.status(200).json({
        type: 'confirm',
        conversationId: conversation.conversationId,
        text,
        pendingAction: {
          tool: confirmPayload.tool,
          confirmToken,
          preview,
        },
        dailyRemaining: quota.remaining,
      });
    }

    if (!assistantText) {
      assistantText = hadToolResult
        ? 'Lead data mil gaya, lekin jawab nahi ban paya. Dubara try karo.'
        : 'Samajh nahi aaya. Lead ke baare mein thoda aur likho.';
    }

    const type = classifyReply(assistantText, hadToolResult);
    conversation.messages.push({ role: 'assistant', content: assistantText, type });
    conversation.messages = trimMessages(conversation.messages);
    await conversation.save();

    return res.status(200).json({
      type,
      conversationId: conversation.conversationId,
      text: assistantText,
      pendingAction: null,
      dailyRemaining: quota.remaining,
    });
  } catch (error) {
    console.error('AI overview error:', error?.message || error);
    if (error?.status === 401) {
      return res.status(502).json({
        type: 'error',
        text: 'OpenAI key invalid hai. .env mein OPENAI_API_KEY check karo.',
      });
    }
    next(error);
  }
};
