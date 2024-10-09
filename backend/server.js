const express = require("express");
const { google } = require("googleapis");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true,
}));
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
  refresh_token: process.env.REFRESH_TOKEN,
};

// Set the credentials if available
if (tokens.access_token && tokens.refresh_token) {
  oAuth2Client.setCredentials(tokens);
}

// Handle token refreshing logic if the access token expires
oAuth2Client.on("tokens", (newTokens) => {
  if (newTokens.refresh_token) {
    tokens.refresh_token = newTokens.refresh_token;
  }
  tokens.access_token = newTokens.access_token;

  const envContent = `CLIENT_ID=${process.env.CLIENT_ID}\nCLIENT_SECRET=${process.env.CLIENT_SECRET}\nREDIRECT_URI=${process.env.REDIRECT_URI}\nREFRESH_TOKEN=${tokens.refresh_token}\nACCESS_TOKEN=${tokens.access_token}\nPORT=${PORT}`;
  fs.writeFileSync(".env", envContent);
});

// Gmail API instance
const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

// Middleware to check if tokens are available
function ensureAuthenticated(req, res, next) {
  if (!tokens.access_token || !tokens.refresh_token) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    });
    return res.redirect(authUrl);
  }
  next();
}

// Helper function to decode base64url encoded content
function decodeBase64(bodyData) {
  const buff = Buffer.from(bodyData, "base64");
  return buff.toString("utf-8");
}
function decodeBase(encodedContent) {
  return Buffer.from(encodedContent, "base64").toString("utf8");
}

function getHtmlContent(parts) {
  let htmlContent = ""; // Initialize HTML content variable

  // Recursive function to find HTML body
  function findBodyParts(part) {
    if (part.mimeType === "text/html" && part.body.data) {
      htmlContent += decodeBase(part.body.data); // Append decoded HTML content
    }
    // Check for nested parts (multipart)
    if (part.parts) {
      part.parts.forEach(findBodyParts); // Call recursively for nested parts
    }
  }

  parts.forEach(findBodyParts); // Start the search from the top-level parts
  return htmlContent; // Return the accumulated HTML content
}

function getPlainTextBody(parts) {
  if (!parts) return "";
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body && part.body.data) {
      return decodeBase64(part.body.data);
    }
    if (part.parts) {
      const nestedBody = getPlainTextBody(part.parts);
      if (nestedBody) return nestedBody;
    }
  }
  return "";
}
// Fetch All Emails - This requires user authentication
app.get("/api/emails", ensureAuthenticated, async (req, res) => {
  try {
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20, // Adjust this number as needed
      q: 'from:(internshala.com OR linkedin.com) AND (internship OR intern)', // Query for internship-related emails
    });

    const messages = response.data.messages || [];
    const emailDetails = await Promise.all(
      messages.map(async (message) => {
        const msg = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });
        const subjectHeader = msg.data.payload.headers.find(
          (header) => header.name === "Subject"
        );
        const subject = subjectHeader ? subjectHeader.value : "No Subject";
        const snippet = msg.data.snippet;

        // Get plain body text from the email
        const plainBody = getPlainTextBody(msg.data.payload.parts);
        // const htmlContent=getHtmlContent(msg.data.payload.parts)
        const cleanedBody = plainBody
          .replace(/&nbsp;|&zwnj;/g, " ") // Replace HTML non-breaking spaces and zero-width joiners with regular spaces
          .replace(/\r?\n|\r/g, " ") // Remove newlines and replace with space
          .replace(/\s+/g, " ") // Replace multiple spaces with a single space
          .trim();
        const htmlContent = getHtmlContent(msg.data.payload.parts);
        function extractLinks(body, htmlContent) {
          const linkPattern = /https?:\/\/[^\s]+/g; // Regex pattern to match URLs
          let links = body.match(linkPattern) || []; // Find all URLs using regex; default to an empty array if null
          // Check if links were found; if not, look in the HTML content
          if (links.length === 0 && htmlContent) {
            try {
              const { JSDOM } = require("jsdom"); // Make sure you're importing JSDOM
              const dom = new JSDOM(htmlContent); // Parsing the HTML body
              links = Array.from(dom.window.document.querySelectorAll("a")).map(
                (anchor) => anchor.href
              );
            } catch (error) {
              console.error("Error parsing HTML body:", error.message);
            }
          }
          return links; // Return the extracted links
        }
        // Assume htmlContent is the raw HTML of the email
        const links = extractLinks(cleanedBody, htmlContent);
        // Split the plain body into structured data (for example, split by new lines)
        const splitData = plainBody.split("\n");
        function cleanString(s) {
          // Remove unwanted HTML entities and excessive whitespace
          let cleaned = s.replace(/(&nbsp;|&zwnj;|&nb|sp;|&n|bsp;)+/g, "");
          cleaned = cleaned.trim();
          return cleaned;
        }

        // Apply the cleaning function to each item in the array
        const cleanedData = splitData
          .map((item) => cleanString(item))
          .filter((item) => item.length > 0);
        // Process the split data to find matched results (custom logic)
        const matchedResult = splitData.find((line) =>
          line.toLowerCase().includes("internship")
        );
        function extractJobs(data) {
          const jobs = [];
          let job = {};
          let captureJob = false; // Flag to track if we're capturing a job
          const exclusionPatterns = [
            "Top job picks",  // For filtering out "Top job picks for you" type messages
            "Your job alert", // For filtering out "Your job alert" type messages
            'new jobs match your preferences',
            "new jobs match your preferences"
          ];
        

          data.forEach((item) => {
            if (exclusionPatterns.some((pattern) => item.includes(pattern))) {
              return;
            }
            // Case 1: Handling "View job:" type job listings
            if (item.includes("View job:")) {
              job.url = [item.split("View job: ")[1]]; // Extract job URL

              // Ensure that we are not adding non-job entries like "Your job alert"
              if (!exclusionPatterns.some((pattern) => job.title?.includes(pattern))) {
                jobs.push(job); // Push the job to the list
              }

              job = {}; // Reset job object for the next one
              captureJob = false; // Reset capture flag to avoid overlap
            }
            // Case 2: Handling "Actively hiring" job listings
            else if (item.includes("Actively hiring")) {
              captureJob = true; // Start capturing job details when "Actively hiring" is found
              job = {}; // Initialize a new job object
            }
            // Extract fields for actively hiring jobs
            else if (captureJob) {
              if (!job.title) {
                job.title = item; // First field is the job title
              } else if (!job.company) {
                job.company = item; // Second is the company name
              } else if (!job.location) {
                job.location = item; // Third is the location
              } else if (!job.duration) {
                job.duration = item; // Fourth is the duration
              } else if (!job.salary) {
                job.salary = item; // Fifth is the salary
              } else if (!job.posted) {
                job.posted = item; // Sixth is the posting time
              } else if (!job.type) {
                job.type = item; // Seventh is the job type
                const jobKeywords = job.title.toLowerCase().split(' ');
                const companyKeywords = job.company ? job.company.toLowerCase().split(' ') : [];
              
                // Filter links based on job title and company name
                job.links = links.filter(link => {
                  const lowerLink = link.toLowerCase();
                  const matchesJobTitle = jobKeywords.some(keyword => lowerLink.includes(keyword));
                  const matchesCompanyName = companyKeywords.some(keyword => lowerLink.includes(keyword));
                  
                  // Only include the link if both job title and company name match
                  return matchesJobTitle && matchesCompanyName && lowerLink.includes("internship");
                });
                
                jobs.push(job); // Push the job to the list after capturing all fields
                captureJob = false; // Reset capture flag after completing a job entry
              }
            }
            // Handle generic fields for "View job:" type listings (no "Actively hiring" flag)
            else if (!captureJob && !item.includes("-----")) {
              if (!job.title) {
                job.title = item; // First field is the job title
              } else if (!job.company) {
                job.company = item; // Second is the company name
              } else if (!job.location) {
                job.location = item; // Third is the location
              }
            }
          });

          return jobs;
        }

        // Initial job extraction for the first dataset
        let jobsList = extractJobs(cleanedData);

        // If no jobs found in the first extraction, reprocess
        if (jobsList.length === 0) {
          jobsList = extractJobs(cleanedData); // Reprocess using the same function
        }
        return {
          subject,
          snippet,
          cleanedData,
          jobsList,
        };
      })
    );

    res.json(emailDetails);
  } catch (error) {
    console.error("Error fetching emails:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// OAuth2 Callback Route
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Authorization code missing.");
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const envContent = `CLIENT_ID=${process.env.CLIENT_ID}\nCLIENT_SECRET=${process.env.CLIENT_SECRET}\nREDIRECT_URI=${process.env.REDIRECT_URI}\nREFRESH_TOKEN=${tokens.refresh_token}\nACCESS_TOKEN=${tokens.access_token}\nPORT=${PORT}`;
    fs.writeFileSync(".env", envContent);

    console.log("Access Token:", tokens.access_token);
    console.log("Refresh Token:", tokens.refresh_token);

    res.send("Authorization successful! You can close this window.");
  } catch (error) {
    console.error("Error exchanging code for tokens:", error.message);
    res.status(500).send("Error during authorization.");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
