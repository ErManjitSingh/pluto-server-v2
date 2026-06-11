import nodemailer from 'nodemailer';

// mail.demandsetutours.com is behind Cloudflare (no SMTP on 465).
// Connect to the Hostinger origin IP; keep TLS SNI as mail.demandsetutours.com.
const DEMAND_SMTP = {
  host: process.env.DEMANDSETUTOURS_SMTP_HOST || '119.18.54.120',
  port: Number(process.env.DEMANDSETUTOURS_SMTP_PORT) || 465,
  secure: process.env.DEMANDSETUTOURS_SMTP_SECURE !== 'false',
  tlsName: process.env.DEMANDSETUTOURS_SMTP_TLS_NAME || 'mail.demandsetutours.com',
  user: 'info@demandsetutours.com',
};

// Create transporter for demandsetutours.com email
const createDemandsetutoursTransporter = () => {
  return nodemailer.createTransport({
    host: DEMAND_SMTP.host,
    port: DEMAND_SMTP.port,
    secure: DEMAND_SMTP.secure,
    name: DEMAND_SMTP.tlsName,
    auth: {
      user: DEMAND_SMTP.user,
      pass: process.env.DEMANDSETUTOURS_EMAIL_PASSWORD || '',
    },
    tls: {
      rejectUnauthorized: false,
      servername: DEMAND_SMTP.tlsName,
    },
  });
};

// Send email with fullName, email, phoneNumber, travellingFrom, and destination
export const sendContactEmail = async (fullName, email, phoneNumber, additionalInfo = {}) => {
  try {
    const transporter = createDemandsetutoursTransporter();

    const mailOptions = {
      from: {
        name: fullName,
        address: email
      },
      to: 'info@demandsetutours.com', // Send to the company email
      replyTo: email, // Allow replies to go to the sender
      subject: `New Contact Inquiry from ${fullName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <h2 style="color: #2c3e50; margin-top: 0;">New Contact Inquiry</h2>
          </div>
          
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; background-color: #f8f9fa; font-weight: bold; width: 180px;">Full Name:</td>
                <td style="padding: 10px;">${fullName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; background-color: #f8f9fa; font-weight: bold;">Email:</td>
                <td style="padding: 10px;"><a href="mailto:${email}">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px; background-color: #f8f9fa; font-weight: bold;">Phone Number:</td>
                <td style="padding: 10px;"><a href="tel:${phoneNumber}">${phoneNumber}</a></td>
              </tr>
              ${additionalInfo.travellingFrom ? `
              <tr>
                <td style="padding: 10px; background-color: #f8f9fa; font-weight: bold;">Travelling From:</td>
                <td style="padding: 10px;">${additionalInfo.travellingFrom}</td>
              </tr>
              ` : ''}
              ${additionalInfo.destination ? `
              <tr>
                <td style="padding: 10px; background-color: #f8f9fa; font-weight: bold;">Destination:</td>
                <td style="padding: 10px;">${additionalInfo.destination}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e8f4f8; border-radius: 5px; font-size: 12px; color: #666;">
            <p style="margin: 0;">This email was sent from the Demand Setu Tours contact form.</p>
            <p style="margin: 5px 0 0;">Date: ${new Date().toLocaleString()}</p>
          </div>
        </div>
      `,
      text: `
New Contact Inquiry

Full Name: ${fullName}
Email: ${email}
Phone Number: ${phoneNumber}
${additionalInfo.travellingFrom ? `Travelling From: ${additionalInfo.travellingFrom}` : ''}
${additionalInfo.destination ? `Destination: ${additionalInfo.destination}` : ''}

Date: ${new Date().toLocaleString()}
      `
    };

    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

export default {
  sendContactEmail,
  createDemandsetutoursTransporter
};
