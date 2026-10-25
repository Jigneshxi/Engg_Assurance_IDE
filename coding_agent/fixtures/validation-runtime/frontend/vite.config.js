export default { server: { proxy: { '/api': { target: process.env.VITE_API_URL, changeOrigin: true } } } };
