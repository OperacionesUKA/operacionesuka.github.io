// Configuración pública de Firebase para los avisos en el celular.
// Estos datos no son secretos (Firebase los publica en todas sus apps web). La llave privada NUNCA va aquí:
// esa se guarda solo en las propiedades del script de Apps Script (FCM_CUENTA).
// Copia los valores de Firebase › Configuración del proyecto › General › Tus apps › Configuración del SDK.
var UKA_FIREBASE = {
  apiKey: 'AIzaSyB8M_5MbwO9OLtf2NxfkN_gLFxlhto-z-U',
  authDomain: 'operaciones-uka.firebaseapp.com',
  projectId: 'operaciones-uka',
  storageBucket: 'operaciones-uka.firebasestorage.app',
  messagingSenderId: '226737203833',
  appId: '1:226737203833:web:d4b5682f8562141a45c2a8'
};
// Firebase › Configuración del proyecto › Cloud Messaging › Certificados push web › Par de claves (la clave pública).
var UKA_VAPID = 'BAaOJDmD9Gg79yVl2et5d3QKMzleEUebesyMe-nDHg-PggUB5oiCWqa7JXPcnFF81Ch3j4-8b8mY3FMjB3OIwoA';
