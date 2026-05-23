"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = void 0;
const errorHandler = (err, req, res, next) => {
    console.error('💥 Error global interceptado:', err.message);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
};
exports.errorHandler = errorHandler;
const notFoundHandler = (req, res, next) => {
    res.status(404).json({ error: 'Not Found', message: 'Route does not exist' });
};
exports.notFoundHandler = notFoundHandler;
