# Ocula Frontend

This repository contains the frontend application for the **Ocula** full-stack project. It is built with React and provides an interactive user interface for authentication, image-based face detection, and AI-generated face analysis.

🔗 **Live Demo:** [https://ocula-frontend.vercel.app/](https://ocula-frontend.vercel.app/)

---

## Overview

The application enables users to:

* Register and sign in securely
* Submit an image URL
* Detect one or multiple faces within an image
* View AI-generated face summaries, including:

  * Estimated age
  * Gender
  * Facial expression

The frontend communicates with a backend API to handle authentication, user data, and processing requests.

---

## Tech Stack

* **JavaScript (ES6+)**
* **React 19**
* **CSS**
* **Tachyons**
* **face-api.js**
* **tsParticles**

---

## Runtime Versions

* **Node.js:** 20.x
* **npm:** 10.x
* **Package Manager:** npm

---

## Project Structure

```
ocula-frontend/
├── public/
│   └── models/
├── src/
│   ├── components/
│   ├── utils/
│   ├── App.css
│   ├── App.js
│   └── config.js
├── .env.example
├── package.json
└── README.md
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
REACT_APP_API_URL=https://your-backend-url.onrender.com
```

> ⚠️ All frontend environment variables must begin with `REACT_APP_`.

**Example:**

```env
REACT_APP_API_URL=https://ocula-server.onrender.com
```

---

## Installation

Install dependencies:

```bash
npm install
```

---

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

---

## Deployment

### Vercel (Recommended)

Use the following configuration:

* **Framework Preset:** Create React App
* **Root Directory:** `ocula-frontend`
* **Build Command:** `npm run build`
* **Output Directory:** `build`

Ensure the `REACT_APP_API_URL` environment variable is configured in your Vercel project settings.

---

### GitHub Pages

This project supports static deployment using the `gh-pages` package.

---

## Notes

* The frontend depends on a backend API defined via `REACT_APP_API_URL`.
* Face detection models are stored locally in `public/models`.
* AI-generated face summaries are estimates and may not always be accurate.

---

## Related Project

The backend service for this application is available here:

🔗 [https://github.com/Huzefa077/ocula-server](https://github.com/Huzefa077/ocula-server)

The backend is responsible for handling authentication, API endpoints, user data management, and integrating AI processing services.
