const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(bodyParser.urlencoded({ extended: true }));

// Initialize OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
);

// Load tokens from environment
const tokens = {
    access_token: process.env.ACCESS_TOKEN,
    refresh_token: process.env.REFRESH_TOKEN
};

if (tokens.access_token && tokens.refresh_token) {
    oAuth2Client.setCredentials(tokens);
}

const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

// Fetch All Emails
app.get('/api/emails', async (req, res) => {
    try {
        // Ensure tokens are set
        if (!oAuth2Client.credentials.access_token || !oAuth2Client.credentials.refresh_token) {
            throw new Error('Access or refresh token is missing.');
        }

        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: 10 // Adjust this number as needed
        });

        const messages = response.data.messages || [];

        const emailDetails = await Promise.all(
            messages.map(async (message) => {
                const msg = await gmail.users.messages.get({
                    userId: 'me',
                    id: message.id
                });
                const subjectHeader = msg.data.payload.headers.find(
                    header => header.name === 'Subject'
                );
                const subject = subjectHeader ? subjectHeader.value : 'No Subject';
                const snippet = msg.data.snippet;
                return { subject, snippet };
            })
        );

        res.json(emailDetails);
    } catch (error) {
        console.error('Error fetching emails:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// OAuth2 Callback Route
app.get('/oauth2callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send('Authorization code missing.');
    }

    try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        // Save the refresh token and access token to a file or environment
        const envContent = `CLIENT_ID=${process.env.CLIENT_ID}\nCLIENT_SECRET=${process.env.CLIENT_SECRET}\nREDIRECT_URI=${process.env.REDIRECT_URI}\nREFRESH_TOKEN=${tokens.refresh_token}\nACCESS_TOKEN=${tokens.access_token}\nPORT=${PORT}`;
        fs.writeFileSync('.env', envContent);

        console.log('Access Token:', tokens.access_token);
        console.log('Refresh Token:', tokens.refresh_token);

        res.send('Authorization successful! You can close this window.');
    } catch (error) {
        console.error('Error exchanging code for tokens:', error.message);
        res.status(500).send('Error during authorization.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
