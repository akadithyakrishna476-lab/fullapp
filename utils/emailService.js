/**
 * Email Service for sending CR credentials
 * Uses EmailJS for email delivery (no backend required)
 * 
 * Setup Instructions:
 * 1. Sign up at https://www.emailjs.com/
 * 2. Create an email service (Gmail, Outlook, etc.)
 * 3. Create an email template with variables: {{to_email}}, {{student_name}}, {{cr_email}}, {{cr_password}}, {{slot}}, {{year}}, {{faculty_name}}
 * 4. Replace SERVICE_ID, TEMPLATE_ID, and PUBLIC_KEY below with your values
 */

// EmailJS Configuration
// Get these from https://dashboard.emailjs.com/
const EMAILJS_CONFIG = {
  SERVICE_ID: 'service_classconnect',  // Replace with your EmailJS service ID
  TEMPLATE_ID: 'template_cr_credentials',  // Replace with your template ID
  PUBLIC_KEY: 'YOUR_EMAILJS_PUBLIC_KEY',  // Replace with your public key
  ENABLED: false,  // Set to true to enable real email sending
};

/**
 * Send CR credentials to student's email
 * @param {Object} params - Email parameters
 * @param {string} params.studentEmail - Student's email address
 * @param {string} params.studentName - Student's name
 * @param {string} params.crEmail - CR login email (generated)
 * @param {string} params.crPassword - CR login password (generated)
 * @param {string} params.slot - CR slot (CR-1 or CR-2)
 * @param {string} params.year - Academic year
 * @param {string} params.facultyName - Faculty member's name (optional)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const sendCRCredentialsEmail = async ({
  studentEmail,
  studentName,
  crEmail,
  crPassword,
  slot,
  year,
  facultyName = 'Your Faculty',
}) => {
  try {
    // Check if email sending is enabled
    if (!EMAILJS_CONFIG.ENABLED) {
      return simulateEmail({ studentEmail, studentName, crEmail, crPassword, slot, year, facultyName });
    }
    // Check if email sending is enabled
    if (!EMAILJS_CONFIG.ENABLED) {
      return simulateEmail({ studentEmail, studentName, crEmail, crPassword, slot, year, facultyName });
    }

    // Validate configuration
    if (!EMAILJS_CONFIG.PUBLIC_KEY || EMAILJS_CONFIG.PUBLIC_KEY === 'YOUR_EMAILJS_PUBLIC_KEY') {
      console.warn('⚠️ EmailJS not configured. Set PUBLIC_KEY in emailService.js');
      return simulateEmail({ studentEmail, studentName, crEmail, crPassword, slot, year, facultyName });
    }

    // Send real email using EmailJS
    const templateParams = {
      to_email: studentEmail,
      to_name: studentName,
      student_name: studentName,
      cr_email: crEmail,
      cr_password: crPassword,
      slot: slot,
      year: year,
      faculty_name: facultyName,
      subject: `ClassConnect - You've been assigned as ${slot}`,
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_CONFIG.SERVICE_ID,
        template_id: EMAILJS_CONFIG.TEMPLATE_ID,
        user_id: EMAILJS_CONFIG.PUBLIC_KEY,
        template_params: templateParams,
      }),
    });

    if (response.ok) {
      console.log('✅ Email sent successfully to:', studentEmail);
      return {
        success: true,
        message: 'Email sent successfully',
        simulated: false,
      };
    } else {
      const errorText = await response.text();
      throw new Error(`EmailJS error: ${errorText}`);
    }

  } catch (error) {
    console.error('❌ Email send error:', error);
    return {
      success: false,
      message: `Failed to send email: ${error.message}`,
      simulated: false,
    };
  }
};

/**
 * Simulate email sending (for development/testing)
 * @private
 */
const simulateEmail = ({ studentEmail, studentName, crEmail, crPassword, slot, year, facultyName }) => {
  const emailData = {
    to: studentEmail,
    subject: `ClassConnect - You've been assigned as ${slot}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <div style="background-color: #0f5f73; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">ClassConnect</h1>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #0f5f73; margin-top: 0;">Congratulations, ${studentName}!</h2>
          
          <p style="font-size: 16px; color: #2c3e50; line-height: 1.6;">
            You have been assigned as <strong>${slot}</strong> for <strong>${year}</strong> by ${facultyName}.
          </p>
          
          <div style="background-color: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f5f73;">
            <h3 style="color: #0f5f73; margin-top: 0;">Your Login Credentials</h3>
            <p style="margin: 10px 0; font-size: 14px; color: #555;">
              <strong>Email:</strong><br/>
              <code style="background-color: white; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 5px; font-size: 14px;">${crEmail}</code>
            </p>
            <p style="margin: 10px 0; font-size: 14px; color: #555;">
              <strong>Password:</strong><br/>
              <code style="background-color: white; padding: 8px 12px; border-radius: 4px; display: inline-block; margin-top: 5px; font-size: 14px;">${crPassword}</code>
            </p>
          </div>
          
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; font-size: 14px; color: #856404;">
              <strong>⚠️ Security Note:</strong> Please keep these credentials secure and change your password after your first login.
            </p>
          </div>
          
          <p style="font-size: 14px; color: #555; line-height: 1.6;">
            You can now log in to the ClassConnect mobile app using the CR login option and access your Class Representative dashboard.
          </p>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="font-size: 12px; color: #95a5a6; margin: 0;">
              This is an automated message from ClassConnect.<br/>
              If you have any questions, please contact your faculty.
            </p>
          </div>
        </div>
      </div>
    `,
    text: `
Congratulations, ${studentName}!

You have been assigned as ${slot} for ${year} by ${facultyName}.

Your Login Credentials:
Email: ${crEmail}
Password: ${crPassword}

Security Note: Please keep these credentials secure and change your password after your first login.

You can now log in to the ClassConnect mobile app using the CR login option.

---
This is an automated message from ClassConnect.
    `.trim(),
  };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 EMAIL SIMULATION (NOT ACTUALLY SENT)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('To:', emailData.to);
  console.log('Subject:', emailData.subject);
  console.log('Credentials:');
  console.log(`  Email: ${crEmail}`);
  console.log(`  Password: ${crPassword}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  To enable real email sending:');
  console.log('   1. Sign up at https://www.emailjs.com/');
  console.log('   2. Configure EMAILJS_CONFIG in utils/emailService.js');
  console.log('   3. Set ENABLED: true');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  return {
    success: false,
    message: '⚠️ Email NOT sent (simulation mode). Enable EmailJS to send real emails.',
    simulated: true,
    emailData,
  };
};

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Send batch emails to multiple recipients
 * @param {Array} recipients - Array of recipient objects
 * @returns {Promise<Array>}
 */
export const sendBatchCREmails = async (recipients) => {
  const results = [];
  
  for (const recipient of recipients) {
    const result = await sendCRCredentialsEmail(recipient);
    results.push({
      ...recipient,
      ...result,
    });
  }
  
  return results;
};

/**
 * Get email service configuration status
 * @returns {Object} Configuration status
 */
export const getEmailServiceStatus = () => {
  return {
    enabled: EMAILJS_CONFIG.ENABLED,
    configured: EMAILJS_CONFIG.PUBLIC_KEY && EMAILJS_CONFIG.PUBLIC_KEY !== 'YOUR_EMAILJS_PUBLIC_KEY',
    provider: 'EmailJS',
    message: EMAILJS_CONFIG.ENABLED 
      ? '✅ Email sending is enabled'
      : '⚠️ Email sending is disabled (simulation mode)',
  };
};
