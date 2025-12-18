import Agent from '../models/agent.model.js';
import nodemailer from 'nodemailer';
import { generateUsername, generatePassword } from '../utils/credentials.js';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Create new agent
export const createAgent = async (req, res, next) => {
  try {
    const agentData = req.body;
    
    const agent = await Agent.create(agentData);
    
    res.status(201).json({
      success: true,
      message: 'Agent created successfully',
      data: agent
    });
  } catch (error) {
    next(error);
  }
};

// Get all agents
export const getAgents = async (req, res, next) => {
  try {
    const agents = await Agent.find();
    
    res.status(200).json({
      success: true,
      data: agents
    });
  } catch (error) {
    next(error);
  }
};

// Get single agent by ID
export const getAgentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const agent = await Agent.findById(id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: agent
    });
  } catch (error) {
    next(error);
  }
};

// Update agent
export const updateAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const agent = await Agent.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Agent updated successfully',
      data: agent
    });
  } catch (error) {
    next(error);
  }
};

// Delete agent
export const deleteAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const agent = await Agent.findByIdAndDelete(id);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Agent deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get pending agent enquiries
export const getPendingEnquiries = async (req, res, next) => {
  try {
    const pendingAgents = await Agent.find({ approvalStatus: 'pending' });
    
    res.status(200).json({
      success: true,
      data: pendingAgents
    });
  } catch (error) {
    next(error);
  }
};

// Approve agent enquiry
export const approveAgent = async (req, res, next) => {
  try {
    console.log('=== START APPROVAL PROCESS ===');
    const { id } = req.params;
    const { adminComments } = req.body;
    
    console.log('Received request:', { id, adminComments });

    // First get the agent to access the agency name
    const existingAgent = await Agent.findById(id);
    if (!existingAgent) {
      console.log('Agent not found with ID:', id);
      return res.status(404).json({
        success: false,
        message: 'Agent enquiry not found'
      });
    }

    console.log('Found existing agent:', {
      id: existingAgent._id,
      agencyName: existingAgent.agencyName,
      email: existingAgent.email
    });

    // Generate credentials
    const username = await generateUsername(existingAgent.agencyName);
    const password = generatePassword();
    console.log('Generated credentials:', { username, password });

    // Update agent with new credentials
    try {
      console.log('Updating agent with new credentials...');
      const agent = await Agent.findByIdAndUpdate(
        id,
        {
          approvalStatus: 'approved',
          isActive: true,
          adminComments,
          username,
          password,
          updatedAt: new Date()
        },
        { new: true }
      );

      console.log('Agent updated successfully:', {
        id: agent._id,
        email: agent.email,
        username: agent.username,
        approvalStatus: agent.approvalStatus
      });

      console.log('=== STARTING EMAIL PROCESS ===');
      // Send email with credentials - with retries
      let emailSent = false;
      let attempts = 0;
      const maxAttempts = 3;

      while (!emailSent && attempts < maxAttempts) {
        try {
          attempts++;
          console.log(`Starting email attempt ${attempts} of ${maxAttempts}`);
          
          // Wait 2 seconds between attempts
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Calling sendCredentialsEmail with:', {
            email: agent.email,
            username,
            passwordLength: password.length
          });

          await sendCredentialsEmail(agent.email, username, password);
          emailSent = true;
          console.log(`Email sent successfully on attempt: ${attempts}`);
        } catch (emailError) {
          console.error(`Email attempt ${attempts} failed:`, {
            error: emailError.message,
            stack: emailError.stack
          });

          if (attempts === maxAttempts) {
            console.error('All email attempts failed');
          }
        }
      }

      console.log('=== APPROVAL PROCESS COMPLETE ===');
      // Return success response even if email failed
      res.status(200).json({
        success: true,
        message: `Agent approved successfully. Email ${emailSent ? 'sent' : 'failed to send'}`,
        data: {
          agent,
          emailStatus: emailSent ? 'sent' : 'failed'
        }
      });

    } catch (updateError) {
      console.error('Error updating agent:', {
        error: updateError.message,
        stack: updateError.stack
      });
      throw updateError;
    }

  } catch (error) {
    console.error('Error in approveAgent:', {
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
};

// Email sending function
const sendCredentialsEmail = async (email, username, password) => {
  console.log('Starting email send process to:', email);
  
  try {
    const transporter = nodemailer.createTransport({
      host: 'server.himachaltour.online',
      port: 465,
      secure: true,
      auth: {
        user: 'support@plutotours.in',
        pass: 'p4QTEX24vVMPFbf'
      },
      debug: true,
      logger: true,
      tls: {
        rejectUnauthorized: false
      },
      dkim: {
        domainName: 'plutotours.in',
        keySelector: 'default',
        privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA9l4gPbdGu/96ECQVTYGFdBFD5MMEaO13Bl3zdBFXjCqZmLzN
A1032fTlyItW/yo4PccF9gKtHbIFiOKgF5MfbiXnl2TBrqeqL9e33wm5S7CnrNkgT
JYSShrR/MA3BDmqGMQfWjfF4iGR5UU03tkyfZBUBfhwms5KW+sGn6s5tldGnGd4M
IvlJUF59vs+ILxiKnyDMvdSx0rbxIfeKb7IEHWQlwOhtC0KUO9KqLPFZBBaIodS
XhZuU91uFjrZT1Z4jN3UdBfOZ5+sOUBMNLa93fHVYteV/eK93EOkakLwmtG9XEpoM
CFYwS5FjrwvKtFVPtSzwuaHtfOhHwwQ7YfwwOlZQANwvIBbKPAJtFwTECFPnc
t+YE9dfZxCktTNyW29zqmHIi31frEG2sJzlpQ1hZMN2KpjawY3+fnjpG9S5nrPh
dBeKBvbFQ74XGdnZBh+WikzxzdbrQlhbj9QSPahau4v5tMTKZSmLWWbwlBjtyS5J
O39rZMX4wWSUW7bu3ITAAklzGlUI1kbiSZFdp1DR2dR2RcRC3fJrk7K9W01KKGPp
bjPYE4NqLCvVVCLGH/eNbGcQucYFcWLxd3QEGGQd7/AktlAqFEkdhVNLbADJlSp
fItylscbCb7x/RvKYDEIzoGbBCZ4INDHLNGdPlbROqp8JTilxLprqU0QkEyGQLQ
EQKNODwBAoGBAP4YljSXbwmlPsqQLQr7TKwN7Cw+/twofxXRSSEF8Uz4iG7bNPyS
s/Z9zcwBsClz3R4zd2AkRbkqaR3RGYtNZuGuMYAys5LRo+KCwXMiQQ+9plkhhZG
SSqdEEtOGciPMEuewUpilDG4//usgfEY7TjOWX2Gc84BtNsuqqN8/wcsYfZAwGBAPip
W/rtQvkQfB6353zBGPXvM3IAhgZWqQ94ZXKsTkM+PZxPQKpHUfCwUb/WTW7jx51q
uxfxMZmtTwRvNkNWpyp4qct+9MrwEpaPGWyZmFnGnWepPksFGfHLwmCHtEZQbZ74
psHfbclBKyMCwKe6/4GhwzlYIkL94PmgYdGTGwGcGEwEBRFjWlZwxwJTcKEG
Z77wZPBPBzWYLqbWKKEHmBmWXyHLmR3HdJA2qk4FkFvNEWMZ/9PZtj9JswSXbsR
TuwhZYJRvQ5rjxZ/8KXaH9QNTfWzwn3Alm4AQUdtTmPFuUFDhwZkiR3WfJwxXGdG
IDEXS19hqbJ+37IaPDdinhnKgYR3/vJ+MsGGp7pGMrhgH45ZEAkSEhbletZdAb+6D
Q7fTM9PzfQWQSMHB/fQSbWN5qCU8YrpKmtluPLZxoQYEDn9P3Y/wKjnOHEBjvQlQ
WPYz/wa73/XCK5Pce7IunQKfaBEtEV2ny/nOcMIKydGtGnrrcjP3Bm4sYtAf34kg
KDUvAOKBgfgBxbUcoQDL/5zS2nfY/TZ18/v9LiW/1/AH9lt5lDDNQ8T5mW649/keHG
LEBIgBV4tZAkg7dQjUepDNIT2Yec7PPKip47lv9tyQcxPeYEooyWKj167ms3tuIc
vmt25ejeTCIkXHZxhYq3B8x/wG3RqkwaeaZx2ztnqrUAaZKkikXG
-----END RSA PRIVATE KEY-----`
      }
    });

    console.log('Email configuration:', {
      host: 'mail.plutotours.in',
      port: 465,
      user: 'support@plutotours.in'
    });

    const mailOptions = {
      from: {
        name: 'Pluto Tours',
        address: 'support@plutotours.in'
      },
      to: email,
      subject: 'Your Pluto Tours Agent Account Details',
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'Pluto Tours Mailer'
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #2c3e50; text-align: center;">Welcome to Pluto Tours!</h1>
          <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px;">
            <p>Dear Travel Partner,</p>
            <p>Your agent account has been approved. Here are your login credentials:</p>
            <div style="background-color: #ffffff; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
            </div>
            <p style="color: #e74c3c;"><strong>Important:</strong> Please change your password after your first login.</p>
            <p>For any assistance, contact us at support@plutotours.in</p>
            <p>Best regards,<br>Team Pluto Tours</p>
          </div>
        </div>
      `
    };

    console.log('Sending email with options:', {
      to: email,
      subject: mailOptions.subject
    });

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', {
      messageId: info.messageId,
      response: info.response
    });

    return info;
  } catch (error) {
    console.error('Detailed error in sending email:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      errorCommand: error.command
    });
    throw error;
  }
};

// Reject agent enquiry
export const rejectAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason, adminComments } = req.body;
    
    const agent = await Agent.findByIdAndUpdate(
      id,
      {
        approvalStatus: 'rejected',
        rejectionReason,
        adminComments,
        isActive: false,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent enquiry not found'
      });
    }

    // Here you can add email notification to agent about rejection
    
    res.status(200).json({
      success: true,
      message: 'Agent enquiry rejected successfully',
      data: agent
    });
  } catch (error) {
    next(error);
  }
};

// Get agents by status
export const getAgentsByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;
    
    const agents = await Agent.find({ approvalStatus: status });
    
    res.status(200).json({
      success: true,
      data: agents
    });
  } catch (error) {
    next(error);
  }
};

// Add this new function to your existing controller file
export const testEmailConnection = async (req, res) => {
  try {
    console.log('Starting SMTP test...');
    
    const transporter = nodemailer.createTransport({
      host: 'plutotours.in',
      port: 465,
      secure: true,
      auth: {
        user: 'support@plutotours.in',
        pass: 'p4QTEX24vVMPFbf'
      },
      debug: true,
      logger: true,
      tls: {
        rejectUnauthorized: false
      },
      dkim: {
        domainName: 'plutotours.in',
        keySelector: 'default',
        privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA9l4gPbdGu/96ECQVTYGFdBFD5MMEaO13Bl3zdBFXjCqZmLzN
A1032fTlyItW/yo4PccF9gKtHbIFiOKgF5MfbiXnl2TBrqeqL9e33wm5S7CnrNkgT
JYSShrR/MA3BDmqGMQfWjfF4iGR5UU03tkyfZBUBfhwms5KW+sGn6s5tldGnGd4M
IvlJUF59vs+ILxiKnyDMvdSx0rbxIfeKb7IEHWQlwOhtC0KUO9KqLPFZBBaIodS
XhZuU91uFjrZT1Z4jN3UdBfOZ5+sOUBMNLa93fHVYteV/eK93EOkakLwmtG9XEpoM
CFYwS5FjrwvKtFVPtSzwuaHtfOhHwwQ7YfwwOlZQANwvIBbKPAJtFwTECFPnc
t+YE9dfZxCktTNyW29zqmHIi31frEG2sJzlpQ1hZMN2KpjawY3+fnjpG9S5nrPh
dBeKBvbFQ74XGdnZBh+WikzxzdbrQlhbj9QSPahau4v5tMTKZSmLWWbwlBjtyS5J
O39rZMX4wWSUW7bu3ITAAklzGlUI1kbiSZFdp1DR2dR2RcRC3fJrk7K9W01KKGPp
bjPYE4NqLCvVVCLGH/eNbGcQucYFcWLxd3QEGGQd7/AktlAqFEkdhVNLbADJlSp
fItylscbCb7x/RvKYDEIzoGbBCZ4INDHLNGdPlbROqp8JTilxLprqU0QkEyGQLQ
EQKNODwBAoGBAP4YljSXbwmlPsqQLQr7TKwN7Cw+/twofxXRSSEF8Uz4iG7bNPyS
s/Z9zcwBsClz3R4zd2AkRbkqaR3RGYtNZuGuMYAys5LRo+KCwXMiQQ+9plkhhZG
SSqdEEtOGciPMEuewUpilDG4//usgfEY7TjOWX2Gc84BtNsuqqN8/wcsYfZAwGBAPip
W/rtQvkQfB6353zBGPXvM3IAhgZWqQ94ZXKsTkM+PZxPQKpHUfCwUb/WTW7jx51q
uxfxMZmtTwRvNkNWpyp4qct+9MrwEpaPGWyZmFnGnWepPksFGfHLwmCHtEZQbZ74
psHfbclBKyMCwKe6/4GhwzlYIkL94PmgYdGTGwGcGEwEBRFjWlZwxwJTcKEG
Z77wZPBPBzWYLqbWKKEHmBmWXyHLmR3HdJA2qk4FkFvNEWMZ/9PZtj9JswSXbsR
TuwhZYJRvQ5rjxZ/8KXaH9QNTfWzwn3Alm4AQUdtTmPFuUFDhwZkiR3WfJwxXGdG
IDEXS19hqbJ+37IaPDdinhnKgYR3/vJ+MsGGp7pGMrhgH45ZEAkSEhbletZdAb+6D
Q7fTM9PzfQWQSMHB/fQSbWN5qCU8YrpKmtluPLZxoQYEDn9P3Y/wKjnOHEBjvQlQ
WPYz/wa73/XCK5Pce7IunQKfaBEtEV2ny/nOcMIKydGtGnrrcjP3Bm4sYtAf34kg
KDUvAOKBgfgBxbUcoQDL/5zS2nfY/TZ18/v9LiW/1/AH9lt5lDDNQ8T5mW649/keHG
LEBIgBV4tZAkg7dQjUepDNIT2Yec7PPKip47lv9tyQcxPeYEooyWKj167ms3tuIc
vmt25ejeTCIkXHZxhYq3B8x/wG3RqkwaeaZx2ztnqrUAaZKkikXG
-----END RSA PRIVATE KEY-----`
      }
    });

    console.log('Testing SMTP connection...');
    await transporter.verify();
    console.log('SMTP connection successful');

    // Try sending a test email
    const testInfo = await transporter.sendMail({
      from: '"Pluto Tours Test" <support@plutotours.in>',
      to: "support@plutotours.in",
      subject: "TEST EMAIL - " + new Date().toISOString(),
      html: `
        <div style="padding: 20px; background-color: #f5f5f5;">
          <h2>Test Email - Please Confirm Receipt</h2>
          <p>This is a test email sent at: ${new Date().toLocaleString()}</p>
          <p>If you receive this, please confirm the email system is working.</p>
          <hr>
          <p>Message ID: ${Date.now()}</p>
        </div>
      `
    });

    console.log('Test email sent:', testInfo.messageId);

    res.status(200).json({
      success: true,
      message: 'SMTP connection successful and test email sent',
      messageId: testInfo.messageId
    });
  } catch (error) {
    console.error('SMTP test failed:', {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      errorCommand: error.command
    });
    
    res.status(500).json({
      success: false,
      message: 'SMTP connection failed',
      error: error.message,
      details: {
        name: error.name,
        code: error.code,
        command: error.command
      }
    });
  }
};

// Agent login
export const agentLogin = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    // Find agent by username and explicitly select password field
    const agent = await Agent.findOne({ username }).select('+password');
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if agent is approved and active
    if (agent.approvalStatus !== 'approved' || !agent.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is not active. Please contact support.'
      });
    }

    // Verify password
    const validPassword = await bcryptjs.compare(password, agent.password);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: agent._id, isAgent: true },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from response
    const { password: pass, ...agentData } = agent.toObject();

    res.cookie('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        agent: agentData,
        token
      }
    });
  } catch (error) {
    next(error);
  }
}; 