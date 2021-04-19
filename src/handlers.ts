import Cookies, { SetOption } from 'cookies';
import querystring from 'querystring';
import { nanoid } from 'nanoid';
import fetch from 'node-fetch';
import crypto from 'crypto';

import mail from './mail';

import {
  getUser,
  saveUser,
  findSessions,
  saveSession,
  getSession,
  saveGroup,
  getAll
} from './database';

import {
  User,
  Group,
  Session,
  Link,
  Log,
  Permission,
  Email,
  Configuration,
  KeyResponse,
  ErrorResponse,
  RedirectResponse,
  SignInResponse,
  LoadResponse
} from './types';

import {
  cookieName,
  cookieOptions,
  wrongCredentials,
  passwordInsecure,
  ServerError,
  notSignedIn
} from './constants';

// GET /public-key
export const publicKey = async (): Promise<KeyResponse> => {
  // Return public key used to decrypt JWT tokens
  return {
    type: 'key',
    key: 'hi'
  };
};

// GET /google-redirect?redirect=<URL>
export const googleRedirect = async (redirect: string): Promise<RedirectResponse> => {
  // Create redirect query to a Google Signin page
  const query = new URLSearchParams({
    redirect_uri: `${process.env.API_URL}/google-sign-in`,
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    access_type: 'offline',
    response_type: 'code',
    prompt: 'consent',
    state: Buffer.from(redirect).toString('base64'),
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ].join(' ')
  }).toString();

  return {
    type: 'redirect',
    location: `https://accounts.google.com/o/oauth2/v2/auth?${query}`
  };
};

// GET /google-sign-in
export const googleSignIn = async (
  cookies: Cookies,
  code: string,
  state: string
): Promise<RedirectResponse> => {
  const redirect = Buffer.from(state, 'base64').toString();

  // Request an access and id tokens from Google using the code
  const tokenRequest = await fetch(`https://oauth2.googleapis.com/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: querystring.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.API_URL}/google-sign-in`,
      grant_type: 'authorization_code'
    })
  }).catch((error) => console.log(error));

  // If the request was not successful
  if (!tokenRequest) {
    return {
      type: 'redirect',
      location: `${redirect}?error=google-token-auth-failed`
    };
  }

  const tokens = await tokenRequest.json();

  // Request thisUser information from Google using the tokens
  const googleRequest = await fetch(
    `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${tokens.access_token}`,
    {
      headers: {
        Authorization: `Bearer ${tokens.id_token}`
      }
    }
  );

  if (googleRequest.status >= 300) {
    return {
      type: 'redirect',
      location: `${redirect}?error=google-user-info-failed`
    };
  }

  const googleUser = await googleRequest.json();

  const foundUser = await getUser(googleUser.email);

  const user = await saveUser({
    created: new Date(),
    email: googleUser.email,
    name: googleUser.name,
    google: googleUser.id,
    picture: googleUser.picture || '',
    ...foundUser
  });

  const sessions = await findSessions({ user: user.email, expired: null });

  const session =
    sessions[0] ||
    (await saveSession({
      id: nanoid(),
      user: user.email,
      expired: null,
      created: new Date()
    }));

  cookies.set(cookieName, session.id, {
    ...cookieOptions,
    expires: new Date(2050, 1, 1)
  });

  return {
    type: 'redirect',
    location: redirect
  };
};

// GET /sign-in-link?id=<id>
export const signInLink = async (id: string): Promise<RedirectResponse> => {
  // Find the non-expired link, if not found redirect to link expired page
  // Find thisUser, if not found create it
  // Create session and set cookie
  // Update the link to expired: now()
  // Redirect to link redirect property
  return null as any;
};

// POST /auto-sign-in
export const autoSignIn = async (cookies: Cookies): Promise<null | SignInResponse> => {
  const sessionID = cookies.get(cookieName, { signed: true });

  if (!sessionID) return null;

  const session = await getSession(sessionID);

  if (session.expired) return null;

  const user = await getUser(session.user);

  // Find all permissions thisUser has by collecting all permissions from users groups and their children

  // Create JWT token

  return {
    type: 'sign-in',
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    password: !!user.password,
    google: !!user.google,
    token: '',
    permissions: []
  };
};

// POST /sign-in
export const manualSignIn = async (
  cookies: Cookies,
  email: string,
  password: string
): Promise<ErrorResponse | SignInResponse> => {
  await new Promise((resolve) => setTimeout(resolve, 500));

  const user = await getUser(email.toLowerCase());

  const hash = crypto.createHash('sha256').update(password).digest('hex');

  if (!user || user.password !== hash) return wrongCredentials;

  const sessions = await findSessions({ user: user.email, expired: null });

  const session =
    sessions[0] ||
    (await saveSession({
      id: nanoid(),
      user: user.email,
      expired: null,
      created: new Date()
    }));

  cookies.set(cookieName, session.id, {
    ...cookieOptions,
    expires: new Date(2050, 1, 1)
  });

  // Find all permissions thisUser has by collecting all permissions from users groups and their children

  // Create JWT token

  return {
    type: 'sign-in',
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    password: !!user.password,
    google: !!user.google,
    token: '',
    permissions: []
  };
};

// POST /sign-up
export const manualSignUp = async (
  email: string,
  password: string,
  redirect: string,
  name?: string
): Promise<ErrorResponse | null> => {
  const user = await getUser(email.toLowerCase());

  if (user) return forgotPassword(user.email, redirect);

  // If password too short return password insecure error
  if (!password) return passwordInsecure;

  const hash = crypto.createHash('sha256').update(password).digest('hex');

  // Send an email with the link and return null

  return null;
};

// POST /forgot-password
export const forgotPassword = async (
  email: string,
  redirect: string
): Promise<ErrorResponse | null> => {
  const user = await getUser(email.toLowerCase());

  if (!user) return null;

  // Create a link

  const { success } = await mail(
    user.email,
    'RemoteAuth: Forgot Password',
    'Just think harder, lol',
    '<strong>Just think harder, lol</strong>'
  );

  if (!success) return ServerError;

  return null;
};

// POST /sign-out
export const signOut = async (cookies: Cookies): Promise<null> => {
  const signin = await autoSignIn(cookies);

  if (!signin) return null;

  const sessions = await findSessions({ user: signin.email, expired: null });

  await Promise.all(sessions.map((session) => saveSession({ ...session, expired: new Date() })));

  cookies.set(cookieName, undefined, cookieOptions);

  return null;
};

// Find all groups that have an owner permission that is part of thisUser permissions and their children (ownedGroups)
const getOwnedGroups = async (permissions: string[]): Promise<Group[]> => {
  return [];
};

// POST /load
export const load = async (cookies: Cookies): Promise<ErrorResponse | LoadResponse> => {
  const signin = await autoSignIn(cookies);

  if (!signin) return notSignedIn;

  const ownedGroups = await getOwnedGroups(signin.permissions);

  // Find all users part of ownedGroups or their children

  const response: LoadResponse = {
    type: 'load',
    groups: ownedGroups,
    users: []
  };

  if (!signin.permissions.includes('root-admin')) return response;

  // Find all non-expired objects that are not users or groups
  const fullResponse = await getAll();

  return {
    ...fullResponse,
    ...response
  };
};

// POST /set-me
export const setMe = async (
  cookies: Cookies,
  name?: string,
  password?: string
): Promise<ErrorResponse | SignInResponse> => {
  const signin = await autoSignIn(cookies);

  if (!signin) return notSignedIn;

  const hash = password ? crypto.createHash('sha256').update(password).digest('hex') : null;

  const user = await getUser(signin.email);

  const update = await saveUser({
    ...user,
    name: name ? name : user.name,
    password: hash ? hash : user.password
  });

  return {
    ...signin,
    name: update.name,
    password: !!update.password
  };
};

// POST /set-user
export const setUser = async (
  cookies: Cookies,
  id?: string,
  email?: string,
  sendEmail?: string,
  groups?: string[],
  name?: string,
  password?: string
): Promise<ErrorResponse | LoadResponse> => {
  const signin = await autoSignIn(cookies);

  if (!signin) return notSignedIn;

  // If no ownedGroups were found or any payloadGroups are not part of ownedGroups, return not authorized error
  // If sendEmail is not undefined, forgot-password or welcome, return not authorized error
  // If no payloadId or payloadEmail provided, return invalid request error
  // Find the targetUser using payloadId or payloadEmail, if not found create it with email, name and password
  // Remove all ownedGroups that are not found in payloadGroups from targetUser
  // Add all payloadGroups to targetUser groups
  // If sendEmail is defined, create a link and send email to targetUser

  return load(cookies);
};

// POST /set-object
export const setObject = async (
  cookies: Cookies,
  collection: string,
  object: User | Group | Session | Permission | Link | Log | Email | Configuration,
  remove?: boolean
): Promise<ErrorResponse | LoadResponse> => {
  const signin = await autoSignIn(cookies);

  if (!signin) return notSignedIn;

  // For each object type remove all non-expired objects not in the list and add or update all others
  console.log('updating', collection, object, 'remove?', remove);

  return load(cookies);
};
