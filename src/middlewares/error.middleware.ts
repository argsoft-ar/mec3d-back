import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Error global interceptado:', err.message);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
};

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  res.status(404).json({ error: 'Not Found', message: 'Route does not exist' });
};
