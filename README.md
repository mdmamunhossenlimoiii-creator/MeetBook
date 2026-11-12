# Mybook — Firebase Setup Instructions

## Prerequisites

1. A Google account
2. Node.js 18+ installed
3. npm or yarn package manager

## Firebase Project Setup

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter a project name (e.g., "mybook-app")
4. Follow the setup wizard (you can disable Google Analytics if you prefer)
5. Click "Create project"

### 2. Enable Authentication

1. In the Firebase Console, go to "Authentication" in the left sidebar
2. Click "Get started"
3. Go to the "Sign-in method" tab
4. Enable "Email/Password" as a sign-in provider
5. Click "Save"

### 3. Create a Firestore Database

1. In the Firebase Console, go to "Firestore Database" in the left sidebar
2. Click "Create database"
3. Choose "Start in production mode" (recommended for security)
4. Select a location for your database (choose one close to your users)
5. Click "Enable"

### 4. Set Up Firestore Security Rules

1. In the Firestore Database section, go to the "Rules" tab
2. Copy the contents of `firestore.rules` from this repository
3. Paste it into the rules editor
4. Click "Publish"

### 5. Get Your Web App Configuration

1. In the Firebase Console, click the gear icon next to "Project Overview"
2. Select "Project settings"
3. Scroll down to the "Your apps" section
4. Click the web icon (`</>`) to add a web app (if you haven't already)
5. Register the app with a nickname (e.g., "Mybook Web")
6. Copy the Firebase configuration object

### 6. Configure Environment Variables

1. In the root of this project, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and replace the placeholder values with your Firebase configuration:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_actual_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_actual_messaging_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id
   ```

3. Save the file

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
mybook/
├── src/
│   ├── app/
│   │   ├── feed/          # Social feed page
│   │   ├── login/         # Login page
│   │   ├── register/      # Registration page
│   │   ├── profile/       # User profile pages
│   │   ├── layout.tsx     # Root layout
│   │   ├── page.tsx       # Home page (redirects to feed)
│   │   └── globals.css    # Global styles
│   ├── components/
│   │   ├── Navbar.tsx     # Navigation bar
│   │   ├── CreatePost.tsx # Create post form
│   │   └── PostCard.tsx   # Post display component
│   ├── contexts/
│   │   └── AuthContext.tsx # Authentication context
│   ├── lib/
│   │   └── firebase/
│   │       ├── config.ts  # Firebase configuration
│   │       ├── auth.ts    # Authentication service
│   │       ├── posts.ts   # Posts service
│   │       └── validate.ts # Config validation
│   └── types/
│       └── index.ts       # TypeScript types
├── .env.example           # Environment variables template
├── firestore.rules        # Firestore security rules
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Features

- **Authentication**: Email/password registration and login
- **User Profiles**: View and edit user profiles
- **Social Feed**: Create, view, like, and comment on posts
- **Responsive Design**: Works on desktop and mobile devices
- **Secure**: Firebase security rules protect user data

## Security Notes

- Never commit `.env.local` to version control
- Firebase security rules are configured to protect user data
- All API keys in the client-side configuration are safe to expose (they're meant to be public)
- Firestore rules ensure users can only modify their own data

## Troubleshooting

### "Firebase configuration is missing" warning

Make sure you've created `.env.local` with valid Firebase credentials and restarted the development server.

### Authentication not working

1. Verify Email/Password authentication is enabled in Firebase Console
2. Check that your Firebase configuration is correct
3. Check the browser console for error messages

### Firestore permission errors

1. Verify your Firestore security rules are published
2. Check that you're authenticated before trying to read/write data
3. Check the browser console for specific error messages

## Support

For issues or questions, please open an issue in the repository.