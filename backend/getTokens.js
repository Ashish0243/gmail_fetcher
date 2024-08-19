const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
);

const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
});

console.log('Authorize this app by visiting this url:', authUrl);

// Replace 'YOUR_AUTHORIZATION_CODE' with the code you receive from the redirect
const code = '4/0AQlEd8ylQQzTp8W08IBwZeJNUOZyfcTXK2xA50lZYFIvk7_6N0V83UTy9AiPKHg_cWTKEw'; // Replace with the actual code

async function getTokens() {
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token);

        // Store the refresh token in your .env file or another secure storage
        // You should only need to do this step once to obtain the refresh token
        // For example, write to .env file
        require('fs').appendFileSync('.env', `REFRESH_TOKEN=${tokens.refresh_token}\n`);
    } catch (error) {
        console.error('Error getting tokens:', error);
    }
}

getTokens();
