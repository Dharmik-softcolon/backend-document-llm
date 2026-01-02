/**
 * Polyfill for Promise.withResolvers (Node.js < 22)
 * This is needed for pdfjs-dist compatibility with older Node.js versions
 */
if (!Promise.withResolvers) {
    Promise.withResolvers = function () {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}

