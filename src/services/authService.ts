import { getApiBaseUrl, getApiPath } from '../utils/api';

export interface User {
  id: string;
  email: string;
  username?: string;
  full_name?: string;
  profile_image?: string;
  dob?: string;
  gender?: string;
  google_id?: string;
  current_company_id?: string;
  role?: string;
  organization_id?: number | null;
  organization_name?: string | null;
  organization_logo_url?: string | null;
  created_at?: string;
  updated_at?: string;
  // Trial & Plan fields
  plan_type?: 'trial' | 'paid' | 'enterprise' | null;
  plan_valid_until?: string | null;
  trial_started_at?: string | null;
}

export interface Profile {
  id: string;
  updated_at: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export const authService = {
  // Authenticate user with email and password
  async authenticateUser(email: string, password: string): Promise<User | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Invalid credentials');
      }

      return result.user;
    } catch (error: any) {
      console.error('Authentication error:', error);
      throw new Error(error.message || 'Authentication failed');
    }
  },

  // Register a new user
  async registerUser(email: string, username: string, password: string): Promise<User | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, username, password }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Registration failed');
      }

      return result.user;
    } catch (error: any) {
      console.error('Registration error:', error);
      throw new Error(error.message || 'Registration failed');
    }
  },

  // Sign in with Google
  async signInWithGoogle(): Promise<User | null> {
    // This will be handled by redirecting to the Google OAuth endpoint
    window.location.href = `${getApiBaseUrl()}${getApiPath()}/auth/google`;
    return null;
  },

  // Handle Google Sign-In callback
  async handleGoogleSignInCallback(): Promise<User | null> {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');

    if (userParam) {
      try {
        const user = JSON.parse(decodeURIComponent(userParam));
        return user;
      } catch (error) {
        console.error('Error parsing user data from URL:', error);
        return null;
      }
    }

    return null;
  },

  // Sign out user
  async signOut(): Promise<void> {
    try {
      await fetch(`${getApiBaseUrl()}${getApiPath()}/auth/logout`, {
        method: 'POST',
      });
    } catch (error: any) {
      console.error('Sign out error:', error);
      throw new Error(error.message || 'Sign out failed');
    }
  },

  // Get user by ID
  async getUserById(id: string): Promise<User | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/users/${id}`);

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch user');
      }

      return result.user;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  },

  // Get user profile
  async getUserProfile(userId: string): Promise<User | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/users/profile/${userId}`);

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch profile');
      }

      return result.user;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  },

  // Update user profile
  async updateUserProfile(userId: string, data: Partial<User>): Promise<User | null> {
    try {
      const response = await fetch(`${getApiBaseUrl()}${getApiPath()}/users/profile/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to update user profile');
      }

      return result.user;
    } catch (error) {
      console.error('Error updating user metadata:', error);
      throw error;
    }
  }
};