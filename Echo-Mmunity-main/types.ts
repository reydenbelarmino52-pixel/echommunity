
export type Role = 'MEMBER' | 'ADMIN' | 'OFFICER';
export type Organization = 'CES' | 'TCC' | 'ICSO' | 'GENERAL';

// Define View type for routing and view management
export type View = 'LOGIN' | 'SIGNUP' | 'DASHBOARD' | 'WORKSHOPS' | 'WORKSHOP_DETAIL' | 'ANALYTICS' | 'ADMIN_USERS' | 'PROFILE' | 'ORG_DASHBOARD';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING';
  read: boolean;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  officerOrg?: Organization; // Only if role is OFFICER
  avatarUrl?: string;
  createdAt: string; // ISO String for analytics
  badges: Badge[];
  certificates: Certificate[];
  notifications: Notification[];
}

export interface Badge {
  id: string;
  title: string;
  issuedAt: string;
  organization: Organization;
  workshopTitle: string;
  imageUrl?: string;
}

export interface Certificate {
  id: string;
  title: string;
  issuedAt: string;
  organization: Organization;
  workshopTitle: string;
  content: string;
  fileUrl?: string;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface Participant {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface Workshop {
  id: string;
  title: string;
  description: string;
  date: string; // ISO String
  organization: Organization;
  bannerUrl?: string;
  badgeUrl?: string;
  certificateUrl?: string;
  limit?: number; // 0 or undefined means unlimited
  participants: Participant[]; 
  comments: Comment[];
}

export interface AnnouncementComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  organization: Organization;
  authorId: string;
  authorName: string;
  authorRole: Role;
  authorAvatar?: string;
  likes: string[]; // Array of user IDs
  comments: AnnouncementComment[];
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
