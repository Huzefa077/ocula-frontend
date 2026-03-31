# Ocula Frontend

It is the client-side application for the Ocula full-stack project which is is built with React and provides the user interface for registration, sign in, face detection, and AI-based face summaries from image URLs.

## Overview

The frontend allows users to:

- register and sign in
- submit an image URL
- detect one or more faces in the image
- view AI-generated face summaries such as estimated age, gender, and expression

The application communicates with the Ocula backend API for authentication and user data updates.

## Tech Stack

- React
- face-api.js
- CSS
- Tachyons
- tsParticles

## Project Structure

```text
ocula-frontend/
├── public/
│   └── models/
├── src/
│   ├── components/
│   ├── utils/
│   ├── App.js
│   ├── App.css
│   └── config.js
├── .env.example
├── package.json
└── README.md
```

## Environment Variables

Create a `.env` file in the project root.

```env
REACT_APP_API_URL=https://your-backend-url.onrender.com
```

Example:

```env
REACT_APP_API_URL=https://ocula-server.onrender.com
```

Frontend environment variables must begin with `REACT_APP_`.

## Installation

```bash
npm install
```

## Running the Project

Start the development server:

```bash
npm start
```

Create a production build:

```bash
npm run build
```

Deploy the static build to GitHub Pages:

```bash
npm run deploy
```

## Deployment

### Vercel

Recommended Vercel settings:

- Framework Preset: Create React App
- Root Directory: `ocula-frontend`
- Build Command: `npm run build`
- Output Directory: `build`

Required environment variable:

```env
REACT_APP_API_URL=https://your-backend-url.onrender.com
```

### GitHub Pages

The project also supports GitHub Pages deployment using the `gh-pages` package.

## Notes

- The frontend expects the backend API to be available through the configured `REACT_APP_API_URL`.
- Face detection uses model files stored locally in `public/models`.
- AI-generated face summaries are estimates and may not always be accurate.

## Related Project

The backend for this application is available in the `ocula-server` folder.
