// Inject script into the main page to spoof navigator.webdriver
const script = document.createElement('script');
script.textContent = `
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
    });
    window.navigator.chrome = {
        runtime: {},
    };
`;
document.documentElement.appendChild(script);
script.remove();
