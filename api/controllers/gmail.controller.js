import { google } from 'googleapis';
import GmailToken from '../models/gmailToken.model.js';
import { errorHandler } from '../utils/error.js';
import Maker from '../models/maker.model.js';
import Lead from '../models/lead.model.js';
import EmailActivity from '../models/emailActivity.model.js';

// OAuth2 client factory (creates new instance per request for better concurrency)
const createOAuthClient = () => {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || 'https://api.demandsetutours.com/api/crm/gmail/callback'
    );
};

// Shared OAuth client for OAuth flow (single use per flow)
const oauth2Client = createOAuthClient();

// Scopes required for Gmail API
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
];

/**
 * Initiate Gmail OAuth flow
 * Redirects maker to Google OAuth consent screen
 */
export const initiateGmailAuth = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        
        if (!userId) {
            return next(errorHandler(401, 'Authentication required'));
        }

        // Validate maker exists
        const maker = await Maker.findById(userId);
        if (!maker) {
            return next(errorHandler(404, 'Maker not found'));
        }

        // Generate OAuth URL with state parameter to track maker
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Required to get refresh token
            scope: SCOPES,
            prompt: 'consent', // Force consent screen to get refresh token
            state: userId.toString() // Pass maker ID in state
        });

        res.json({
            success: true,
            authUrl: authUrl,
            message: 'Redirect maker to this URL to authorize Gmail access'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Handle OAuth callback from Google
 * Exchange authorization code for tokens
 */
export const handleGmailCallback = async (req, res, next) => {
    try {
        const { code, state } = req.query;

        if (!code) {
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>No authorization code received from Google.</p>
                        <p>Please try again.</p>
                    </body>
                </html>
            `);
        }

        if (!state) {
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>Invalid authorization state. Please try again.</p>
                    </body>
                </html>
            `);
        }

        // Validate state - ensure maker exists (security check)
        const maker = await Maker.findById(state);
        if (!maker) {
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>Invalid maker. Please try again.</p>
                    </body>
                </html>
            `);
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        
        if (!tokens.refresh_token) {
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Authorization Failed</h1>
                        <p>Refresh token not received. Please try again.</p>
                    </body>
                </html>
            `);
        }

        // Get user info from Google
        oauth2Client.setCredentials(tokens);
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();

        // Prevent duplicate Gmail connections (edge case)
        // Check if this Gmail is already connected to a different user
        const existingEmail = await GmailToken.findOne({
            email: userInfo.data.email,
            userId: { $ne: state }
        });

        if (existingEmail) {
            return res.status(400).send(`
                <html>
                    <body>
                        <h1>Gmail Already Connected</h1>
                        <p>This Gmail account (${userInfo.data.email}) is already connected to another user.</p>
                        <p>Please disconnect it first or use a different Gmail account.</p>
                    </body>
                </html>
            `);
        }

        // Save only refreshToken, email, and scope (NOT accessToken)
        const tokenData = {
            userId: state,
            email: userInfo.data.email,
            refreshToken: tokens.refresh_token,
            scope: tokens.scope || SCOPES.join(' '),
            isActive: true
        };

        const tokenDoc = await GmailToken.findOneAndUpdate(
            { userId: state },
            tokenData,
            { upsert: true, new: true }
        );

        // STEP 5.4: Activate Gmail Push Notifications (users.watch)
        // This tells Gmail to send events to Pub/Sub when inbox changes
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const watchResponse = await gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName: process.env.GMAIL_PUBSUB_TOPIC || 'projects/ptw-crm-email/topics/gmail-crm-updates',
                    labelIds: ['INBOX', 'SENT'] // Watch both inbox and sent mail for replies and thread updates
                }
            });

            // Watch expires in 7 days, set expiration to 6 days for safety
            const watchExpiration = new Date();
            watchExpiration.setDate(watchExpiration.getDate() + 6);

            await GmailToken.findByIdAndUpdate(tokenDoc._id, {
                watchExpiration: watchExpiration
            });

            console.log(`✅ Gmail watch activated for ${userInfo.data.email}. Expires: ${watchExpiration.toISOString()}`);
        } catch (watchError) {
            console.error('⚠️ Warning: Failed to activate Gmail watch:', watchError.message);
            // Don't fail the OAuth flow if watch fails - user can still use email
        }

        // Success page
        res.send(`
            <html>
                <head>
                    <title>Gmail Authorization Successful</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        }
                        .container {
                            background: white;
                            padding: 40px;
                            border-radius: 10px;
                            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                            text-align: center;
                            max-width: 500px;
                        }
                        h1 {
                            color: #4CAF50;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #666;
                            line-height: 1.6;
                        }
                        .success-icon {
                            font-size: 64px;
                            margin-bottom: 20px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✅</div>
                        <h1>Gmail Authorization Successful!</h1>
                        <p>Your Gmail account (<strong>${userInfo.data.email}</strong>) has been successfully connected.</p>
                        <p>You can now close this window and return to the CRM.</p>
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Gmail OAuth callback error:', error);
        res.status(500).send(`
            <html>
                <body>
                    <h1>Authorization Error</h1>
                    <p>An error occurred during authorization: ${error.message}</p>
                    <p>Please try again.</p>
                </body>
            </html>
        `);
    }
};

/**
 * Get authenticated Gmail client for a maker
 * Google SDK automatically refreshes access tokens when needed
 * Creates new OAuth client per request for better concurrency
 */
const getGmailClient = async (userId) => {
    try {
        // Get refresh token from database
        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });
        
        if (!tokenDoc) {
            throw new Error('Gmail not authorized for this maker');
        }

        // Create new OAuth client per request (better for high concurrency)
        const oauth2Client = createOAuthClient();
        
        // Set only refresh_token - Google SDK handles access token refresh automatically
        oauth2Client.setCredentials({
            refresh_token: tokenDoc.refreshToken
        });

        // Google SDK will automatically refresh access token when needed
        return google.gmail({ version: 'v1', auth: oauth2Client });
    } catch (error) {
        throw error;
    }
};

/**
 * Send email via Gmail API
 */
export const sendGmailEmail = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return next(errorHandler(401, 'Authentication required'));
        }

        const { to, subject, body, htmlBody, cc, bcc, leadId } = req.body;

        if (!to || !subject || (!body && !htmlBody)) {
            return next(errorHandler(400, 'To, subject, and body are required'));
        }

        // Get Gmail client (auto-refreshes tokens)
        const gmail = await getGmailClient(userId);

        // Get token doc for email address
        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });
        if (!tokenDoc) {
            return next(errorHandler(404, 'Gmail not authorized for this maker'));
        }

        // Create email message
        const messageParts = [
            `To: ${to}`,
            cc ? `Cc: ${cc}` : '',
            bcc ? `Bcc: ${bcc}` : '',
            `Subject: ${subject}`,
            'Content-Type: text/html; charset=utf-8',
            '',
            htmlBody || body
        ].filter(Boolean);

        const message = messageParts.join('\n');
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // Send email
        const response = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage
            }
        });

        // 🔗 AUTO-LINK THREAD → LEAD (if leadId provided)
        // Never overwrite existing gmailThreadId (prevents accidental thread hijacking)
        if (leadId && response.data.threadId) {
            try {
                await Lead.findOneAndUpdate(
                    { _id: leadId, gmailThreadId: { $exists: false } },
                    { 
                        gmailThreadId: response.data.threadId,
                        lastEmailAt: new Date()
                    }
                );

                // Save outbound email to EmailActivity
                const fromHeader = `From: ${tokenDoc.email}`;
                const toHeader = `To: ${to}`;
                
                await EmailActivity.create({
                    leadId: leadId,
                    userId: userId,
                    gmailMessageId: response.data.id,
                    gmailThreadId: response.data.threadId,
                    direction: 'OUTBOUND',
                    from: tokenDoc.email,
                    to: to,
                    subject: subject,
                    htmlBody: htmlBody || body,
                    body: body || htmlBody?.replace(/<[^>]*>/g, '') || '',
                    isRead: true
                });

                // Update lastEmailAt on Lead
                await Lead.findByIdAndUpdate(leadId, {
                    lastEmailAt: new Date()
                });

                console.log(`✅ Email linked to lead ${leadId} via threadId ${response.data.threadId}`);
            } catch (linkError) {
                console.warn('⚠️ Failed to link email to lead:', linkError.message);
                // Don't fail the email send if linking fails
            }
        }

        res.json({
            success: true,
            message: 'Email sent successfully',
            data: {
                messageId: response.data.id,
                threadId: response.data.threadId,
                linkedToLead: !!leadId
            }
        });
    } catch (error) {
        console.error('Send email error:', error);
        next(errorHandler(500, `Failed to send email: ${error.message}`));
    }
};

/**
 * Get Gmail connection status for a maker
 */
export const getGmailStatus = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return next(errorHandler(401, 'Authentication required'));
        }

        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });

        if (!tokenDoc) {
            return res.json({
                success: true,
                connected: false,
                message: 'Gmail not connected'
            });
        }

        res.json({
            success: true,
            connected: true,
            data: {
                email: tokenDoc.email,
                connectedAt: tokenDoc.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Disconnect Gmail (revoke access)
 */
export const disconnectGmail = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            return next(errorHandler(401, 'Authentication required'));
        }

        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });

        if (!tokenDoc) {
            return next(errorHandler(404, 'Gmail not connected for this maker'));
        }

        // Revoke token with Google
        try {
            oauth2Client.setCredentials({
                refresh_token: tokenDoc.refreshToken
            });
            await oauth2Client.revokeCredentials();
        } catch (error) {
            console.error('Error revoking token:', error);
            // Continue with deletion even if revocation fails
        }

        // Delete token from database
        await GmailToken.findOneAndDelete({ userId });

        res.json({
            success: true,
            message: 'Gmail disconnected successfully'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get list of emails (inbox)
 * Limited to 10-20 results for performance
 */
export const getGmailInbox = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const maxResults = Math.min(parseInt(req.query.maxResults) || 10, 20); // Limit to 20 max
        const pageToken = req.query.pageToken;

        if (!userId) {
            return next(errorHandler(401, 'Authentication required'));
        }

        const gmail = await getGmailClient(userId);

        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: maxResults,
            pageToken: pageToken,
            q: req.query.q || '' // Search query (e.g., 'is:unread', 'from:example@gmail.com')
        });

        // Get full message details
        const messages = await Promise.all(
            (response.data.messages || []).map(async (msg) => {
                const message = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });
                return message.data;
            })
        );

        res.json({
            success: true,
            data: {
                messages: messages,
                nextPageToken: response.data.nextPageToken,
                resultSizeEstimate: response.data.resultSizeEstimate
            }
        });
    } catch (error) {
        next(errorHandler(500, `Failed to fetch emails: ${error.message}`));
    }
};

/**
 * Process attachments from Gmail message
 * Recursively extracts all attachments from message parts
 */
const processAttachments = async (gmail, messageId, parts) => {
    const attachments = [];
    
    if (!parts || !Array.isArray(parts)) {
        return attachments;
    }
    
    for (const part of parts) {
        // Check if this part has an attachment
        if (part.body && part.body.attachmentId) {
            try {
                const attachment = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: messageId,
                    id: part.body.attachmentId
                });
                
                attachments.push({
                    filename: part.filename || 'unnamed',
                    mimeType: part.mimeType,
                    size: part.body.size || 0,
                    data: Buffer.from(attachment.data.data, 'base64'),
                    attachmentId: part.body.attachmentId
                });
            } catch (error) {
                console.warn(`Failed to download attachment ${part.body.attachmentId}:`, error.message);
            }
        }
        
        // Recursively process nested parts (for multipart messages)
        if (part.parts && Array.isArray(part.parts)) {
            const nestedAttachments = await processAttachments(
                gmail,
                messageId,
                part.parts
            );
            attachments.push(...nestedAttachments);
        }
    }
    
    return attachments;
};

/**
 * Sync latest inbox for a maker (called by webhook)
 * Uses historyId for delta sync if available, otherwise falls back to inbox scan
 */
const syncLatestInbox = async (userId) => {
    try {
        const gmail = await getGmailClient(userId);
        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });
        
        if (!tokenDoc) {
            throw new Error('Gmail token not found');
        }
        
        let messages = [];
        let historyId = null;
        
        // Try delta sync using historyId if available (more efficient)
        if (tokenDoc.historyId) {
            try {
                const historyResponse = await gmail.users.history.list({
                    userId: 'me',
                    startHistoryId: tokenDoc.historyId,
                    labelIds: ['INBOX', 'SENT'],
                    maxResults: 50
                });
                
                if (historyResponse.data.history && historyResponse.data.history.length > 0) {
                    // Extract message IDs from history
                    const messageIds = new Set();
                    historyResponse.data.history.forEach(history => {
                        if (history.messagesAdded) {
                            history.messagesAdded.forEach(msg => messageIds.add(msg.message.id));
                        }
                        if (history.messagesDeleted) {
                            history.messagesDeleted.forEach(msg => messageIds.add(msg.message.id));
                        }
                    });
                    
                    // Get full message details
                    messages = await Promise.all(
                        Array.from(messageIds).map(async (msgId) => {
                            try {
                                const message = await gmail.users.messages.get({
                                    userId: 'me',
                                    id: msgId,
                                    format: 'full'
                                });
                                return message.data;
                            } catch (error) {
                                console.warn(`Failed to get message ${msgId}:`, error.message);
                                return null;
                            }
                        })
                    );
                    
                    // Filter out nulls and unread messages
                    messages = messages.filter(msg => msg && msg.labelIds?.includes('UNREAD'));
                    
                    // Update historyId
                    historyId = historyResponse.data.historyId;
                    
                    console.log(`📧 Delta sync: ${messages.length} new messages via historyId`);
                }
            } catch (historyError) {
                // If history sync fails, fall back to inbox scan
                console.warn('History sync failed, falling back to inbox scan:', historyError.message);
            }
        }
        
        // Fallback to inbox scan if historyId not available or history sync failed
        if (messages.length === 0) {
            const response = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 20,
                q: 'is:unread' // Only unread emails
            });

            if (response.data.messages && response.data.messages.length > 0) {
                // Get full message details
                messages = await Promise.all(
                    response.data.messages.map(async (msg) => {
                        const message = await gmail.users.messages.get({
                            userId: 'me',
                            id: msg.id,
                            format: 'full'
                        });
                        return message.data;
                    })
                );
                
                console.log(`📧 Inbox scan: ${messages.length} new messages`);
            }
        }

        if (messages.length === 0) {
            return { synced: 0, message: 'No new emails' };
        }

        // Process messages with attachments
        const messagesWithAttachments = await Promise.all(
            messages.map(async (msg) => {
                const attachments = [];
                
                // Process attachments if message has parts
                if (msg.payload && msg.payload.parts) {
                    attachments.push(...await processAttachments(gmail, msg.id, msg.payload.parts));
                } else if (msg.payload && msg.payload.body && msg.payload.body.attachmentId) {
                    // Single attachment (non-multipart message)
                    try {
                        const attachment = await gmail.users.messages.attachments.get({
                            userId: 'me',
                            messageId: msg.id,
                            id: msg.payload.body.attachmentId
                        });
                        
                        attachments.push({
                            filename: msg.payload.filename || 'unnamed',
                            mimeType: msg.payload.mimeType,
                            size: msg.payload.body.size || 0,
                            data: Buffer.from(attachment.data.data, 'base64'),
                            attachmentId: msg.payload.body.attachmentId
                        });
                    } catch (error) {
                        console.warn(`Failed to download attachment:`, error.message);
                    }
                }
                
                return {
                    ...msg,
                    attachments: attachments,
                    attachmentCount: attachments.length
                };
            })
        );

        // Mark synced emails as READ to prevent duplicate syncing
        await Promise.all(
            messagesWithAttachments.map(async (msg) => {
                try {
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: msg.id,
                        requestBody: {
                            removeLabelIds: ['UNREAD']
                        }
                    });
                } catch (error) {
                    // Don't fail sync if marking as read fails
                    console.warn(`Failed to mark message ${msg.id} as read:`, error.message);
                }
            })
        );

        // Update historyId if we got it from history sync
        if (historyId) {
            await GmailToken.findByIdAndUpdate(tokenDoc._id, {
                historyId: historyId
            });
        }

        // 🔗 AUTO-LINK EMAILS TO LEADS (threadId-based)
        let linkedCount = 0;
        let unlinkedCount = 0;

        for (const msg of messagesWithAttachments) {
            try {
                // Find lead by threadId
                const lead = await Lead.findOne({
                    gmailThreadId: msg.threadId
                });

                if (!lead) {
                    unlinkedCount++;
                    console.log(`⚠️ No lead found for threadId: ${msg.threadId}`);
                    continue;
                }

                // Check if email already exists (prevent duplicates) - per user
                const existingEmail = await EmailActivity.findOne({
                    gmailMessageId: msg.id,
                    userId: userId
                });

                if (existingEmail) {
                    console.log(`ℹ️ Email ${msg.id} already linked, skipping`);
                    continue;
                }

                // Extract email headers
                const getHeader = (headers, name) => {
                    const header = headers.find(h => h.name === name);
                    return header?.value || '';
                };

                const headers = msg.payload?.headers || [];
                const from = getHeader(headers, 'From');
                const to = getHeader(headers, 'To');
                const subject = getHeader(headers, 'Subject');

                // Extract email body
                let body = '';
                let htmlBody = '';

                const extractBody = (payload) => {
                    if (payload.body?.data) {
                        const text = Buffer.from(payload.body.data, 'base64').toString('utf-8');
                        if (payload.mimeType?.includes('html')) {
                            htmlBody = text;
                            body = text.replace(/<[^>]*>/g, ''); // Strip HTML tags
                        } else {
                            body = text;
                        }
                    }

                    if (payload.parts) {
                        payload.parts.forEach(part => {
                            if (part.mimeType?.includes('html') && part.body?.data) {
                                htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
                                if (!body) {
                                    body = htmlBody.replace(/<[^>]*>/g, '');
                                }
                            } else if (part.mimeType?.includes('text/plain') && part.body?.data) {
                                body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                            } else if (part.parts) {
                                extractBody(part);
                            }
                        });
                    }
                };

                extractBody(msg.payload);

                // Detect direction: OUTBOUND if from email matches maker's Gmail
                const isOutbound = from.toLowerCase().includes(tokenDoc.email.toLowerCase());

                // Save email to EmailActivity
                await EmailActivity.create({
                    leadId: lead._id,
                    userId: userId,
                    gmailMessageId: msg.id,
                    gmailThreadId: msg.threadId,
                    direction: isOutbound ? 'OUTBOUND' : 'INBOUND',
                    from: from,
                    to: to,
                    subject: subject,
                    body: body,
                    htmlBody: htmlBody,
                    attachments: msg.attachments?.map(a => ({
                        filename: a.filename,
                        mimeType: a.mimeType,
                        size: a.size,
                        attachmentId: a.attachmentId
                    })) || [],
                    isRead: false
                });

                // Update lastEmailAt on Lead
                await Lead.findByIdAndUpdate(lead._id, {
                    lastEmailAt: new Date()
                });

                linkedCount++;
                console.log(`✅ Email ${msg.id} auto-linked to lead ${lead._id} (threadId: ${msg.threadId}, direction: ${isOutbound ? 'OUTBOUND' : 'INBOUND'})`);

            } catch (linkError) {
                console.error(`❌ Error linking email ${msg.id}:`, linkError.message);
                unlinkedCount++;
            }
        }

        console.log(`📧 Synced ${messagesWithAttachments.length} emails: ${linkedCount} linked to leads, ${unlinkedCount} unlinked`);

        return { 
            synced: messagesWithAttachments.length,
            linked: linkedCount,
            unlinked: unlinkedCount,
            messages: messagesWithAttachments,
            usedDeltaSync: !!historyId
        };
    } catch (error) {
        console.error('Error syncing inbox:', error);
        throw error;
    }
};

/**
 * Webhook endpoint for Gmail Push Notifications
 * Called by Google Pub/Sub when inbox changes
 * 
 * IMPORTANT: 
 * - No auth middleware (called by Google)
 * - Always return 200 (even on errors)
 * - Never return 4xx/5xx
 */
export const handleGmailWebhook = async (req, res) => {
    try {
        const message = req.body?.message?.data;
        
        if (!message) {
            return res.sendStatus(200); // No data, but return 200
        }

        // Decode Pub/Sub message (with safety for malformed retries)
        let decoded;
        try {
            decoded = JSON.parse(
                Buffer.from(message, 'base64').toString('utf-8')
            );
        } catch (parseError) {
            console.warn('⚠️ Failed to parse webhook payload:', parseError.message);
            return res.sendStatus(200); // Always return 200 for Pub/Sub
        }

        const emailAddress = decoded?.emailAddress;
        const historyId = decoded?.historyId; // Store historyId for delta sync

        if (!emailAddress) {
            return res.sendStatus(200); // Invalid message, but return 200
        }

        // Find maker by Gmail email
        const tokenDoc = await GmailToken.findOne({ 
            email: emailAddress,
            isActive: true 
        });

        if (!tokenDoc) {
            console.log(`⚠️ Webhook received for unknown email: ${emailAddress}`);
            return res.sendStatus(200); // Maker not found, but return 200
        }

        // Store historyId if provided (for thread-aware delta syncing)
        if (historyId) {
            await GmailToken.findByIdAndUpdate(tokenDoc._id, {
                historyId: historyId
            });
        }

        // Sync latest inbox for this maker
        await syncLatestInbox(tokenDoc.userId);

        console.log(`✅ Webhook processed for ${emailAddress}`);

        // Always return 200 to Google
        return res.sendStatus(200);
    } catch (err) {
        console.error('❌ Gmail webhook error:', err);
        // Always return 200, even on errors (Google requirement)
        return res.sendStatus(200);
    }
};

/**
 * Renew Gmail watch for a maker
 * Called automatically by cron job every 6 days
 */
export const renewGmailWatch = async (userId) => {
    try {
        const tokenDoc = await GmailToken.findOne({ userId, isActive: true });
        
        if (!tokenDoc) {
            return { success: false, message: 'Gmail not connected' };
        }

        // Create new OAuth client per request (better for concurrency)
        const oauth2Client = createOAuthClient();
        
        // Set credentials
        oauth2Client.setCredentials({
            refresh_token: tokenDoc.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Renew watch
        const watchResponse = await gmail.users.watch({
            userId: 'me',
            requestBody: {
                topicName: process.env.GMAIL_PUBSUB_TOPIC || 'projects/ptw-crm-email/topics/gmail-crm-updates',
                labelIds: ['INBOX', 'SENT'] // Watch both inbox and sent mail
            }
        });

        // Update expiration date (6 days from now)
        const watchExpiration = new Date();
        watchExpiration.setDate(watchExpiration.getDate() + 6);

        await GmailToken.findByIdAndUpdate(tokenDoc._id, {
            watchExpiration: watchExpiration
        });

        console.log(`✅ Gmail watch renewed for ${tokenDoc.email}. New expiration: ${watchExpiration.toISOString()}`);

        return { 
            success: true, 
            email: tokenDoc.email,
            expiration: watchExpiration 
        };
    } catch (error) {
        console.error(`❌ Error renewing watch for user ${userId}:`, error);
        return { success: false, error: error.message };
    }
};
