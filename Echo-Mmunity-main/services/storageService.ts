
import { supabase } from './supabaseClient';
import { User, Workshop, Role, Organization, Notification, Badge, Certificate, Comment, Announcement, AnnouncementComment } from '../types';

/**
 * --- COMPLETE SUPABASE SQL SETUP ---
 * Run this in your Supabase SQL Editor to fix Posting, Editing, and Deleting:
 * 
 * -- 1. Profiles & Roles
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'MEMBER';
 * ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS officer_org text;
 * 
 * -- 2. Announcements Table
 * ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS author_role text DEFAULT 'MEMBER';
 * 
 * -- 3. Workshops Table Fixes (Critical for Workshop Creation)
 * -- RUN THESE ONE BY ONE IF NECESSARY
 * ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS participant_limit integer DEFAULT 0;
 * ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS banner_url text;
 * ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS badge_url text;
 * ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS certificate_url text;
 * 
 * -- 4. Fix Constraints (Allow GENERAL org)
 * ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_organization_check;
 * ALTER TABLE public.announcements ADD CONSTRAINT announcements_organization_check 
 * CHECK (organization IN ('CES', 'TCC', 'ICSO', 'GENERAL'));
 * 
 * ALTER TABLE public.workshops DROP CONSTRAINT IF EXISTS workshops_organization_check;
 * ALTER TABLE public.workshops ADD CONSTRAINT workshops_organization_check 
 * CHECK (organization IN ('CES', 'TCC', 'ICSO', 'GENERAL'));
 * 
 * -- 5. Enable Deleting (Cascading)
 * ALTER TABLE public.announcement_likes DROP CONSTRAINT IF EXISTS announcement_likes_announcement_id_fkey;
 * ALTER TABLE public.announcement_likes ADD CONSTRAINT announcement_likes_announcement_id_fkey 
 * FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;
 * 
 * ALTER TABLE public.announcement_comments DROP CONSTRAINT IF EXISTS announcement_comments_announcement_id_fkey;
 * ALTER TABLE public.announcement_comments ADD CONSTRAINT announcement_comments_announcement_id_fkey 
 * FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;
 * 
 * -- 6. Disable/Fix RLS (Crucial for Posting)
 * ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
 * ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.announcements FOR ALL USING (true) WITH CHECK (true);
 * ALTER TABLE public.announcement_likes ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.announcement_likes FOR ALL USING (true) WITH CHECK (true);
 * ALTER TABLE public.announcement_comments ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.announcement_comments FOR ALL USING (true) WITH CHECK (true);
 * ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.workshops FOR ALL USING (true) WITH CHECK (true);
 * ALTER TABLE public.workshop_participants ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Public Full Access" ON public.workshop_participants FOR ALL USING (true) WITH CHECK (true);
 */

const mapProfileToUser = async (profile: any): Promise<User> => {
    try {
        const [badgesRes, certsRes, notifsRes] = await Promise.all([
            supabase.from('badges').select('*').eq('user_id', profile.id),
            supabase.from('certificates').select('*').eq('user_id', profile.id),
            supabase.from('notifications').select('*').eq('user_id', profile.id)
        ]);

        return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role as Role,
            officerOrg: profile.officer_org as Organization,
            avatarUrl: profile.avatar_url,
            createdAt: profile.created_at,
            badges: (badgesRes.data || []).map((b: any) => ({
                id: b.id,
                title: b.title,
                organization: b.organization as Organization,
                workshopTitle: b.workshop_title,
                issuedAt: b.issued_at,
                imageUrl: b.image_url
            })),
            certificates: (certsRes.data || []).map((c: any) => ({
                id: c.id,
                title: c.title,
                organization: c.organization as Organization,
                workshopTitle: c.workshop_title,
                content: c.content,
                issuedAt: c.issued_at,
                fileUrl: c.file_url
            })),
            notifications: (notifsRes.data || []).map((n: any) => ({
                id: n.id,
                title: n.title,
                message: n.message,
                type: n.type,
                read: n.is_read,
                createdAt: n.created_at
            }))
        };
    } catch (e) {
        console.warn("Secondary user data fetch failed:", e);
        return {
            id: profile.id,
            name: profile.name,
            email: profile.email,
            role: profile.role as Role,
            officerOrg: profile.officer_org as Organization,
            avatarUrl: profile.avatar_url,
            createdAt: profile.created_at,
            badges: [],
            certificates: [],
            notifications: []
        };
    }
};

export const storageService = {
  uploadImage: async (file: File): Promise<string | null> => {
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
          if (uploadError) throw uploadError;
          const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
          return data.publicUrl;
      } catch (error) {
          console.error('Upload service error:', error);
          return null;
      }
  },

  getCurrentUser: async (): Promise<User | null> => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return null;
        const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (error || !profile) return null;
        return mapProfileToUser(profile);
    } catch (e) {
        return null;
    }
  },

  getUsers: async (): Promise<User[]> => {
    try {
        const { data: profiles, error } = await supabase.from('profiles').select('*').order('name');
        if (error) throw error;
        return Promise.all(profiles.map(mapProfileToUser));
    } catch (e) {
        return [];
    }
  },

  saveUser: async (user: User): Promise<void> => {
      const { error } = await supabase.from('profiles').update({
          name: user.name,
          email: user.email,
          role: user.role,
          officer_org: user.officerOrg || null,
          avatar_url: user.avatarUrl
      }).eq('id', user.id);
      if (error) throw error;
  },

  getWorkshops: async (): Promise<Workshop[]> => {
      try {
          const { data: workshops, error } = await supabase
              .from('workshops')
              .select(`
                *,
                workshop_participants (
                    profiles (id, name, email, avatar_url)
                ),
                comments(
                    id, user_id, content, created_at,
                    profiles(name, avatar_url)
                )
              `);
          if (error) throw error;
          return (workshops || []).map((w: any) => ({
              id: w.id,
              title: w.title,
              description: w.description,
              date: w.date,
              organization: w.organization as Organization,
              bannerUrl: w.banner_url,
              badgeUrl: w.badge_url,
              certificateUrl: w.certificate_url,
              limit: w.participant_limit || 0,
              participants: (w.workshop_participants || []).map((wp: any) => wp.profiles).filter((p: any) => !!p).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    email: p.email,
                    avatarUrl: p.avatar_url
                })),
              comments: (w.comments || []).map((c: any) => ({
                  id: c.id,
                  userId: c.user_id,
                  content: c.content,
                  createdAt: c.created_at,
                  userName: c.profiles?.name || 'Unknown',
                  userAvatar: c.profiles?.avatar_url
              }))
          }));
      } catch (e) {
          console.warn("Workshops fetch failed:", e);
          return [];
      }
  },

  createWorkshop: async (workshop: Partial<Workshop>): Promise<void> => {
      const { error } = await supabase.from('workshops').insert({
          title: workshop.title,
          description: workshop.description,
          date: workshop.date,
          organization: workshop.organization,
          banner_url: workshop.bannerUrl,
          badge_url: workshop.badgeUrl,
          certificate_url: workshop.certificateUrl,
          participant_limit: workshop.limit
      });
      if (error) throw error;
  },

  updateWorkshop: async (id: string, updates: Partial<Workshop>): Promise<void> => {
      const { error } = await supabase.from('workshops').update({
          title: updates.title,
          description: updates.description,
          date: updates.date,
          organization: updates.organization,
          banner_url: updates.bannerUrl,
          badge_url: updates.badgeUrl,
          certificate_url: updates.certificateUrl,
          participant_limit: updates.limit
      }).eq('id', id);
      if (error) throw error;
  },

  deleteWorkshop: async (id: string): Promise<void> => {
      const { error } = await supabase.from('workshops').delete().eq('id', id);
      if (error) throw error;
  },

  joinWorkshop: async (workshopId: string, userId: string): Promise<void> => {
      const { error } = await supabase.from('workshop_participants').insert({
          workshop_id: workshopId,
          user_id: userId
      });
      if (error) throw error;
  },

  removeParticipant: async (workshopId: string, userId: string): Promise<void> => {
      const { error } = await supabase
          .from('workshop_participants')
          .delete()
          .eq('workshop_id', workshopId)
          .eq('user_id', userId);
      if (error) throw error;
  },

  getAnnouncements: async (org?: Organization): Promise<Announcement[]> => {
    try {
        let query = supabase
          .from('announcements')
          .select(`
            id, title, content, image_url, organization, author_id, created_at,
            profiles:author_id(name, avatar_url, role),
            announcement_comments(
              id, user_id, content, created_at,
              profiles:user_id(name, avatar_url)
            ),
            announcement_likes(user_id)
          `)
          .order('created_at', { ascending: false });

        if (org) {
          query = query.eq('organization', org);
        }

        const { data, error } = await query;
        if (error) throw error;

        return (data || []).map((a: any) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          imageUrl: a.image_url,
          organization: a.organization as Organization,
          authorId: a.author_id,
          authorName: a.profiles?.name || 'Unknown',
          authorRole: a.profiles?.role || 'MEMBER',
          authorAvatar: a.profiles?.avatar_url,
          createdAt: a.created_at,
          likes: (a.announcement_likes || []).map((l: any) => l.user_id),
          comments: (a.announcement_comments || []).map((c: any) => ({
            id: c.id,
            userId: c.user_id,
            userName: c.profiles?.name || 'Unknown',
            userAvatar: c.profiles?.avatar_url,
            content: c.content,
            createdAt: c.created_at
          }))
        }));
    } catch (error: any) {
        console.error("Supabase Announcements fetch failed:", error.message || error);
        return [];
    }
  },

  createAnnouncement: async (announcement: Partial<Announcement>): Promise<void> => {
    const { error } = await supabase.from('announcements').insert({
      title: announcement.title,
      content: announcement.content,
      image_url: announcement.imageUrl,
      organization: announcement.organization,
      author_id: announcement.authorId,
      author_role: announcement.authorRole || 'MEMBER'
    });
    if (error) throw error;
  },

  updateAnnouncement: async (id: string, updates: Partial<Announcement>): Promise<void> => {
    const { error } = await supabase.from('announcements').update({
      title: updates.title,
      content: updates.content,
      image_url: updates.imageUrl,
      organization: updates.organization
    }).eq('id', id);
    if (error) throw error;
  },

  deleteAnnouncement: async (id: string): Promise<void> => {
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) throw error;
  },

  toggleAnnouncementLike: async (announcementId: string, userId: string, isLiked: boolean): Promise<void> => {
    if (isLiked) {
        await supabase.from('announcement_likes').delete().eq('announcement_id', announcementId).eq('user_id', userId);
    } else {
        await supabase.from('announcement_likes').insert({
            announcement_id: announcementId,
            user_id: userId
        });
    }
  },

  addAnnouncementComment: async (announcementId: string, userId: string, content: string): Promise<void> => {
    await supabase.from('announcement_comments').insert({
        announcement_id: announcementId,
        user_id: userId,
        content: content
    });
  },

  addComment: async (workshopId: string, userId: string, content: string): Promise<void> => {
      await supabase.from('comments').insert({
          workshop_id: workshopId,
          user_id: userId,
          content: content
      });
  },

  sendNotification: async (userId: string, title: string, message: string, type: string): Promise<void> => {
      await supabase.from('notifications').insert({
          user_id: userId,
          title,
          message,
          type,
          is_read: false
      });
  },

  markNotificationRead: async (notifId: string): Promise<void> => {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  },

  markAllNotificationsRead: async (userId: string): Promise<void> => {
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
  },

  issueBadge: async (badge: Partial<Badge> & { userId: string }): Promise<void> => {
      await supabase.from('badges').insert({
          user_id: badge.userId,
          title: badge.title,
          organization: badge.organization,
          workshop_title: badge.workshopTitle,
          issued_at: badge.issuedAt,
          image_url: badge.imageUrl
      });
  },

  issueCertificate: async (cert: Partial<Certificate> & { userId: string }): Promise<void> => {
      await supabase.from('certificates').insert({
          user_id: cert.userId,
          title: cert.title,
          organization: cert.organization,
          workshop_title: cert.workshopTitle,
          content: cert.content,
          issued_at: cert.issuedAt,
          file_url: cert.fileUrl
      });
  },

  revokeAwards: async (userId: string, workshopTitle: string): Promise<void> => {
      await supabase.from('badges').delete().eq('user_id', userId).eq('workshop_title', workshopTitle);
      await supabase.from('certificates').delete().eq('user_id', userId).eq('workshop_title', workshopTitle);
  },

  generateId: () => crypto.randomUUID()
};
