import { SetOption } from 'cookies';

import { ErrorResponse } from './types';

export const cookieName = '__Secure-Session-ID';

export const cookieOptions: SetOption = {
  signed: true,
  sameSite: 'lax',
  secure: true,
  httpOnly: true
};

export const wrongCredentials: ErrorResponse = {
  type: 'error',
  status: 400,
  message: 'wrong-credentials'
};

export const passwordInsecure: ErrorResponse = {
  type: 'error',
  status: 400,
  message: 'password-insecure'
};

export const missingFields: ErrorResponse = {
  type: 'error',
  status: 400,
  message: 'missing-fields'
};

export const methodNotAllowed: ErrorResponse = {
  type: 'error',
  status: 405,
  message: 'method-not-allowed'
};
