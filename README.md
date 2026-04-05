# Ocula Frontend
This repo contains the frontend application part for the Ocula full-stack project. Built with React and provides user interface for authentication, image-based face detection, and AI-generated face summaries.

## Live Demo

- Vercel: [https://ocula-frontend.vercel.app/](https://ocula-frontend.vercel.app/)

## Overview

The frontend allows users to:

- register and sign in
- submit an image URL
- detect one or more faces in the image
- view AI-generated face summaries such as estimated age, gender, and expression

The application communicates with the Ocula backend API for authentication and user entry updates.

## Tech Stack

- JavaScript (ES6+)
- React 19
- CSS
- Tachyons
- face-api.js
- tsParticles

## Runtime Versions

- Node.js: 20.x
- npm: 10.x

## Project Structure

```text
ocula-frontend/
|-- public/
|   `-- models/
|-- src/
|   |-- components/
|   |-- utils/
|   |-- App.css
|   |-- App.js
|   `-- config.js
|-- .env.example
|-- package.json
`-- README.md
```

## Environment Variables

Create a `.env` file in the project root:

```env
REACT_APP_API_URL=https://your-backend-url.onrender.com
```

Frontend environment variables must begin with `REACT_APP_`.

Example:

```env
REACT_APP_API_URL=https://ocula-server.onrender.com
```

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

Recommended settings:

- Framework Preset: Create React App
- Root Directory: `ocula-frontend`
- Build Command: `npm run build`
- Output Directory: `build`
- Add the same `REACT_APP_API_URL` environment variable in the Vercel project settings.

### GitHub Pages

The project also supports static deployment to GitHub Pages using the `gh-pages` package.

## Notes

- The frontend expects the backend API to be available through `REACT_APP_API_URL`.
- Face detection models are stored locally in `public/models`.
- AI-generated face summaries are estimates and may not always be accurate.

## Related Project

The backend for this application is available in the `ocula-server` project.
