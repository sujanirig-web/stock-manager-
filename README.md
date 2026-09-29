# Stock Manager - Inventory Management System

A simple inventory management system built with Firebase Firestore and vanilla JavaScript.

## Features

- Product management (add, edit, delete, stock adjustments)
- Category management
- Real-time updates via Firestore listeners
- Search and filtering
- Low stock alerts
- Inventory valuation
- Anonymous authentication

## Security Features

- **No hardcoded credentials** - Firebase config loaded from environment variables
- **XSS protection** - All user inputs escaped before rendering
- **Authentication required** - Anonymous auth enforced for all database operations
- **Firestore security rules** - Configured to require authentication

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Firebase project credentials.

3. **Deploy Firestore rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

## Project Structure

```
├── index.html          # Main HTML file
├── style.css           # Custom styles
├── app.js              # Main application logic
├── helper.js           # Utility functions
├── firebase.js         # Firebase configuration
├── vite.config.js      # Vite configuration
├── firestore.rules     # Firestore security rules
├── .env.example        # Environment variables template
└── package.json        # NPM scripts
```

## Security Notes

- Never commit `.env` files to version control
- Always deploy `firestore.rules` before production use
- Consider implementing proper user authentication for production
- Review and customize Firestore rules for your access control needs

## Development

The app uses ES modules and requires a local server (provided by Vite). Direct file access (`file://`) will not work due to CORS and module restrictions.

## Firebase Configuration

Required environment variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)