/* Site settings. Safe to publish: a Firebase web config is not a secret, access is controlled by firestore.rules.
   To switch on Google sign-in and community edits, paste your Firebase web app config below (see README, "Connect Google sign-in"). */
window.MERIDIAN_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAUUGpby2-m2r8ZPrxNGQt504MdsKDCTlE',
    authDomain: 'meridian-travel-4fa12.firebaseapp.com',
    projectId: 'meridian-travel-4fa12',
    storageBucket: 'meridian-travel-4fa12.firebasestorage.app',
    messagingSenderId: '949016922598',
    appId: '1:949016922598:web:32d5cf37c2867c784c6e27',
  },
  /* Shape of the config, for reference:
  firebase: {
    apiKey: '...',
    authDomain: 'your-project.firebaseapp.com',
    projectId: 'your-project',
    appId: '...',
  },
  */
  repo: '',   // public code address, for example 'https://github.com/your-name/meridian'. Shown as "Help improve this site".
};
