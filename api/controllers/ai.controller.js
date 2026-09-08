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
import {
  AI_PACKAGE_TOOLS,
  AI_PACKAGE_TOOL_NAMES,
  describeDraft,
  executePackageTool,
} from '../services/aiPackageTools.service.js';

const AI_TOOLS = [...AI_LEAD_TOOLS, ...AI_PACKAGE_TOOLS];

function runTool(name, args, context) {
  if (AI_PACKAGE_TOOL_NAMES.has(name)) {
    return executePackageTool(name, args, context);
  }
  return executeLeadTool(name, args, context);
}

const HISTORY_LIMIT = 16;
const MAX_TOOL_ROUNDS = 4;
const PENDING_TTL_MS = 10 * 60 * 1000;
// Building one package takes several turns, so the old limit of 40 was roughly
// four packages per day. Override with AI_DAILY_LIMIT_PER_USER.
const DEFAULT_DAILY_LIMIT = 120;
const DEFAULT_MODEL = 'gpt-4.1-mini';

function buildSystemPrompt() {
  const { today, yesterday } = istCalendarLabels();
  return `You are the Pluto CRM Assistant. You help with two areas: LEADS and PACKAGES.
Use tools for every fact. Never invent ids, names, prices, counts, or itinerary text.
Today's date is ${today} (IST, Asia/Kolkata). Yesterday is ${yesterday}.
Never use any other "today/yesterday" from training data.
Reply in the same language the user used (Hindi, Hinglish or English). Keep answers short.
Do not mention tools, Mongo, or internal ids unless the user needs an id to confirm an action.

=== LEADS ===
You only help with leads the logged-in user can access. The server already scopes data:
- Executive: own created or assigned leads.
- Admin/manager: assigned leads (isAssignedLead true) for their company only (publish ptw or demand). PTW and Demand never mix.
Never invent leadId, mobile, amounts, or counts.
For "aaj/kal/yesterday/today kitni leads" on the Assigned Leads tab, use assignedToday / assignedYesterday / assignedOn (field assignedAt). That matches the admin Date filter.
If the user says create / bani / created, use createdToday / createdYesterday / createdOn (field createdAt).
Pass calendar days as YYYY-MM-DD. Use countOnly true for count questions. The server expands them to a full IST day. Do not pass an open-ended from-date.
If search returns 0 leads, say not found. If multiple people match, ask which leadId / id.
To find an executive's leads, pass assignedUserName.
Create/update/delete: call the tool only when required fields are present. The server will ask the user to confirm before saving.
Never try bulk delete or "delete all".
Prefer a compact list: leadId, name, mobile, destination, status.
When stating a count, also state the IST date and whether it is assignedAt or createdAt.

=== PACKAGES ===
You can search packages, plan a new one, and create it. You cannot update or delete packages.
Never claim a package was created unless create_package returned created true.

Day rule: total days = total nights + 1. Each place gets 1 travel day plus (nights - 1) local sightseeing days. The last day travels to the drop location.
For any "create a package" request, first collect package name, pickup, drop, and the places with nights, then call plan_package_days. It returns the day plan with itinerary candidates for each day.
Never write itinerary titles or descriptions yourself. Always choose an existing itinerary from the candidates.
When a day has needsChoice true, list the candidate titles and ask the user which one to use. When suggested is present, show it and let the user confirm or swap it.
If the user's stated duration does not match the nights, ask which is correct. Do not silently pick one.

Inclusions, exclusions and policies come only from get_globalmaster. Never write policy text yourself.
"Inclusion" fills packageInclusions, "Exclusions" fills packageExclusions, every other block becomes a customExclusions entry.
Always show these as plain-text points and ask the user to confirm or edit before using them. Handle edits one point at a time; never rewrite a whole block.

For cabs, ask the cabType first (Hatchback, Sedan, SUV, Traveller, ACBus), then call search_cabs and let the user pick a specific cab.
The cab collection stores no price. Always ask the user for the on-season and off-season price. Never guess or reuse a price from another package.

Every decision the user makes must be saved with update_package_draft straight away: the chosen itinerary per day, the policy blocks, the cab and its prices, the state and the package type.
The draft is shown to you below on every turn. Trust the draft over the chat history and never re-ask for something the draft already holds.
When the draft reports nothing missing, call create_package. The server will show a preview and ask the user to confirm before saving.
State and package type are required before creating. Ask for them if the draft does not have them.

Ask for missing information one or two questions at a time, not all at once.`;
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
  if (tool === 'create_package') {
    const lines = [
      `Yeh package create karun?`,
      `Name: ${preview.packageName}`,
      `Duration: ${preview.duration}  |  ${preview.state}  |  ${preview.packageType}`,
      `Route: ${preview.pickupLocation} → ${(preview.places || []).join(' → ')} → ${preview.dropLocation}`,
      'Days:',
      ...(preview.days || []).map((d) => `  ${d}`),
      `Inclusions: ${preview.inclusionPoints} points  |  Exclusions: ${preview.exclusionPoints} points`,
      `Policies: ${(preview.policies || []).join(', ') || '-'}`,
      `Cabs: ${(preview.cabs || []).join(', ') || '-'}`,
      `Base: ${preview.baseTotal}  |  Final: b2b ${preview.finalPrices?.b2b}, internal ${preview.finalPrices?.internal}, website ${preview.finalPrices?.website}`,
      'Confirm ke baad hi save hoga.',
    ];
    return lines.join('\n');
  }
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
  const result = await runTool(pending.tool, pending.args, {
    user: { id: userId },
    maker,
    executeWrites: true,
    draft: conversation.draftPackage,
  });
  const data = result.data || {};
  conversation.pendingAction = null;
  // A created package is finished business, so the draft must not linger.
  if (result.clearDraft) conversation.draftPackage = null;
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

    const draftSummary = describeDraft(conversation.draftPackage);
    const modelMessages = [
      { role: 'system', content: buildSystemPrompt() },
      ...(draftSummary ? [{ role: 'system', content: draftSummary }] : []),
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
        tools: AI_TOOLS,
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
        const toolResult = await runTool(name, args, {
          user: req.user,
          maker,
          executeWrites: false,
          draft: conversation.draftPackage,
        });

        if (toolResult.kind === 'confirm') {
          confirmPayload = toolResult;
          stopForConfirm = true;
          break;
        }

        // Draft edits are applied immediately so later tool calls in this same
        // turn already see them.
        if (toolResult.kind === 'draft') {
          conversation.draftPackage = toolResult.draft;
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
      const enrichFromLead = confirmPayload.tool === 'update_lead' || confirmPayload.tool === 'delete_lead';
      if (enrichFromLead && confirmPayload.args?.id) {
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
