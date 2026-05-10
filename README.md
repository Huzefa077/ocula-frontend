# Ocula Frontend

React frontend for **Ocula**, a full-stack face analysis app where users can sign in, submit an image URL, detect faces, and view simple face details such as estimated age, gender, and expression.

This frontend was built as a learning-focused React project with real app concerns: API configuration, authentication state, protected backend calls, loading states, face detection models, and deployment on Vercel.

## Live Links

- [https://ocula-frontend.vercel.app/](https://ocula-frontend.vercel.app/)

## Other Links
- Backend API: [https://ocula-server.onrender.com](https://ocula-server.onrender.com)
- Backend Docs: [https://ocula-server.onrender.com/docs](https://ocula-server.onrender.com/docs)

## What This Frontend Handles

- User registration and sign in
- JWT token storage in browser local storage
- Authenticated requests to the backend API
- Image URL submission
- Face detection using local `face-api.js` models
- Face detail display for detected faces
- Scan count updates for signed-in users
- Backend availability checks and retry messages
- Admin-only user management panel

## Tech Stack

- React
- JavaScript
- CSS
- Axios
- face-api.js
- Tachyons
- tsParticles
- Vercel

## Project Structure

```text
ocula-frontend/
|-- public/
|   |-- models/             # Face detection model files
|   |-- index.html
|   `-- manifest.json
|-- src/
|   |-- components/         # UI components such as forms, logo, admin panel, and face detection
|   |-- utils/              # Auth token and validation helpers
|   |-- App.js              # Main app state, routing, and scan flow
|   |-- config.js           # Frontend API URL setup
|   |-- index.js            # React entry point
|   `-- index.css
|-- .env.example            # Example frontend environment variable
|-- package.json
|-- vercel.json             # Vercel build and rewrite settings
`-- README.md
```

## Environment Variables

Create a `.env` file locally:

```env
REACT_APP_API_URL=http://localhost:3001
```

For production on Vercel:

```env
REACT_APP_API_URL=https://ocula-server.onrender.com
```

Create React App only exposes frontend variables that start with `REACT_APP_`, so the prefix is required.

Real environment values should stay in local `.env` files or Vercel settings. They should not be committed to GitHub.

## Running Locally

Install dependencies:

```bash
npm install
```

Start the React development server:

```bash
npm start
```

Create a production build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Default local frontend:

```text
http://localhost:3000
```

## Deployment Notes

This frontend is deployed on Vercel.

Vercel setup:

- Framework Preset: Create React App
- Root Directory: `ocula-frontend`
- Build Command: `npm run build`
- Output Directory: `build`
- Environment Variable: `REACT_APP_API_URL`

The backend is deployed separately on Render. The frontend calls the backend URL from `REACT_APP_API_URL`.

## What I Learned

This project helped me practice:

- Managing React app state across authentication and image scanning
- Connecting a React frontend to a separate Express backend
- Sending JWT tokens in request headers
- Handling loading, success, and error states in the UI
- Using local face detection models in the browser
- Deploying a React app with environment variables on Vercel

## Notes

- Face detection runs in the browser using model files stored in `public/models`.
- Age, gender, and expression results are estimates from the model and may not always be accurate.
- The admin panel appears only when the signed-in user has an admin role from the backend token/user profile.

## Related Project

Backend repository/folder: `ocula-server`

Live backend: [https://ocula-server.onrender.com](https://ocula-server.onrender.com)
