/** @type {import('next').NextConfig} */
const nextConfig = {
  // react-chessboard v4 usa react-dnd (HTML5Backend); el doble-montaje de
  // React StrictMode en dev provoca "Cannot have two HTML5 backends" y rompe
  // el arrastre de piezas. Se desactiva (no afecta a producción).
  reactStrictMode: false,
};

module.exports = nextConfig;
