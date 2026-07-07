import { authService, UserRoles } from './auth.js';
import { config } from '../config/supabase.js';

const PERMISSIONS = {
  VIEW_POST: 'view_post',
  CREATE_POST: 'create_post',
  EDIT_POST: 'edit_post',
  DELETE_POST: 'delete_post',
  PIN_POST: 'pin_post',
  LOCK_POST: 'lock_post',
  
  VIEW_COMMENT: 'view_comment',
  CREATE_COMMENT: 'create_comment',
  EDIT_COMMENT: 'edit_comment',
  DELETE_COMMENT: 'delete_comment',
  
  LIKE_POST: 'like_post',
  LIKE_COMMENT: 'like_comment',
  
  FAVORITE_POST: 'favorite_post',
  
  VIEW_CATEGORY: 'view_category',
  CREATE_CATEGORY: 'create_category',
  EDIT_CATEGORY: 'edit_category',
  DELETE_CATEGORY: 'delete_category',
  
  VIEW_PROFILE: 'view_profile',
  EDIT_PROFILE: 'edit_profile',
  VIEW_OTHER_PROFILE: 'view_other_profile',
  
  VIEW_ADMIN: 'view_admin',
  MANAGE_USERS: 'manage_users',
  MANAGE_REPORTS: 'manage_reports',
  MANAGE_LOGS: 'manage_logs',
  MANAGE_SETTINGS: 'manage_settings'
};

const ROLE_PERMISSIONS = {
  [UserRoles.GUEST]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE
  ],
  
  [UserRoles.USER]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.CREATE_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.CREATE_COMMENT,
    PERMISSIONS.LIKE_POST,
    PERMISSIONS.LIKE_COMMENT,
    PERMISSIONS.FAVORITE_POST,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.EDIT_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE
  ],
  
  [UserRoles.VIP]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.CREATE_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.CREATE_COMMENT,
    PERMISSIONS.LIKE_POST,
    PERMISSIONS.LIKE_COMMENT,
    PERMISSIONS.FAVORITE_POST,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.EDIT_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE
  ],
  
  [UserRoles.MODERATOR]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.CREATE_POST,
    PERMISSIONS.EDIT_POST,
    PERMISSIONS.DELETE_POST,
    PERMISSIONS.PIN_POST,
    PERMISSIONS.LOCK_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.CREATE_COMMENT,
    PERMISSIONS.EDIT_COMMENT,
    PERMISSIONS.DELETE_COMMENT,
    PERMISSIONS.LIKE_POST,
    PERMISSIONS.LIKE_COMMENT,
    PERMISSIONS.FAVORITE_POST,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.EDIT_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE,
    PERMISSIONS.MANAGE_REPORTS
  ],
  
  [UserRoles.ADMIN]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.CREATE_POST,
    PERMISSIONS.EDIT_POST,
    PERMISSIONS.DELETE_POST,
    PERMISSIONS.PIN_POST,
    PERMISSIONS.LOCK_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.CREATE_COMMENT,
    PERMISSIONS.EDIT_COMMENT,
    PERMISSIONS.DELETE_COMMENT,
    PERMISSIONS.LIKE_POST,
    PERMISSIONS.LIKE_COMMENT,
    PERMISSIONS.FAVORITE_POST,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.CREATE_CATEGORY,
    PERMISSIONS.EDIT_CATEGORY,
    PERMISSIONS.DELETE_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.EDIT_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE,
    PERMISSIONS.VIEW_ADMIN,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_REPORTS,
    PERMISSIONS.MANAGE_LOGS,
    PERMISSIONS.MANAGE_SETTINGS
  ],
  
  [UserRoles.SUPER_ADMIN]: [
    PERMISSIONS.VIEW_POST,
    PERMISSIONS.CREATE_POST,
    PERMISSIONS.EDIT_POST,
    PERMISSIONS.DELETE_POST,
    PERMISSIONS.PIN_POST,
    PERMISSIONS.LOCK_POST,
    PERMISSIONS.VIEW_COMMENT,
    PERMISSIONS.CREATE_COMMENT,
    PERMISSIONS.EDIT_COMMENT,
    PERMISSIONS.DELETE_COMMENT,
    PERMISSIONS.LIKE_POST,
    PERMISSIONS.LIKE_COMMENT,
    PERMISSIONS.FAVORITE_POST,
    PERMISSIONS.VIEW_CATEGORY,
    PERMISSIONS.CREATE_CATEGORY,
    PERMISSIONS.EDIT_CATEGORY,
    PERMISSIONS.DELETE_CATEGORY,
    PERMISSIONS.VIEW_PROFILE,
    PERMISSIONS.EDIT_PROFILE,
    PERMISSIONS.VIEW_OTHER_PROFILE,
    PERMISSIONS.VIEW_ADMIN,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_REPORTS,
    PERMISSIONS.MANAGE_LOGS,
    PERMISSIONS.MANAGE_SETTINGS
  ]
};

export const permissionService = {
  PERMISSIONS,
  
  async hasPermission(permission) {
    try {
      const userResponse = await authService.getCurrentUser();
      
      if (!userResponse.success) {
        const guestPermissions = ROLE_PERMISSIONS[UserRoles.GUEST] || [];
        return guestPermissions.includes(permission);
      }
      
      const user = userResponse.data;
      const role = user.role || UserRoles.USER;
      const permissions = ROLE_PERMISSIONS[role] || [];
      
      return permissions.includes(permission);
    } catch (error) {
      console.error('Permission hasPermission error:', error);
      return false;
    }
  },
  
  async hasAnyPermission(permissions) {
    try {
      for (const permission of permissions) {
        if (await this.hasPermission(permission)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Permission hasAnyPermission error:', error);
      return false;
    }
  },
  
  async hasAllPermissions(permissions) {
    try {
      for (const permission of permissions) {
        if (!await this.hasPermission(permission)) {
          return false;
        }
      }
      return true;
    } catch (error) {
      console.error('Permission hasAllPermissions error:', error);
      return false;
    }
  },
  
  async canEditPost(postUserId) {
    try {
      const userResponse = await authService.getCurrentUser();
      
      if (!userResponse.success) {
        return false;
      }
      
      const user = userResponse.data;
      
      if (user.id === postUserId) {
        return true;
      }
      
      return await authService.isModerator() || await authService.isAdmin();
    } catch (error) {
      console.error('Permission canEditPost error:', error);
      return false;
    }
  },
  
  async canDeletePost(postUserId) {
    try {
      return await this.canEditPost(postUserId);
    } catch (error) {
      console.error('Permission canDeletePost error:', error);
      return false;
    }
  },
  
  async canEditComment(commentUserId) {
    try {
      const userResponse = await authService.getCurrentUser();
      
      if (!userResponse.success) {
        return false;
      }
      
      const user = userResponse.data;
      
      if (user.id === commentUserId) {
        return true;
      }
      
      return await authService.isModerator() || await authService.isAdmin();
    } catch (error) {
      console.error('Permission canEditComment error:', error);
      return false;
    }
  },
  
  async canDeleteComment(commentUserId) {
    try {
      return await this.canEditComment(commentUserId);
    } catch (error) {
      console.error('Permission canDeleteComment error:', error);
      return false;
    }
  },
  
  async isAdminOrAbove() {
    try {
      return await authService.isAdmin();
    } catch (error) {
      console.error('Permission isAdminOrAbove error:', error);
      return false;
    }
  },
  
  async isModeratorOrAbove() {
    try {
      return await authService.isModerator() || await authService.isAdmin();
    } catch (error) {
      console.error('Permission isModeratorOrAbove error:', error);
      return false;
    }
  },
  
  async canAccessAdminPanel() {
    try {
      return await this.hasPermission(PERMISSIONS.VIEW_ADMIN);
    } catch (error) {
      console.error('Permission canAccessAdminPanel error:', error);
      return false;
    }
  },
  
  async getCurrentUserPermissions() {
    try {
      const userResponse = await authService.getCurrentUser();
      
      if (!userResponse.success) {
        return ROLE_PERMISSIONS[UserRoles.GUEST] || [];
      }
      
      const user = userResponse.data;
      const role = user.role || UserRoles.USER;
      
      return ROLE_PERMISSIONS[role] || [];
    } catch (error) {
      console.error('Permission getCurrentUserPermissions error:', error);
      return [];
    }
  },
  
  async getCurrentUserRole() {
    try {
      const userResponse = await authService.getCurrentUser();
      
      if (!userResponse.success) {
        return UserRoles.GUEST;
      }
      
      const user = userResponse.data;
      return user.role || UserRoles.USER;
    } catch (error) {
      console.error('Permission getCurrentUserRole error:', error);
      return UserRoles.GUEST;
    }
  },
  
  async isSuperAdmin() {
    try {
      return await authService.isSuperAdmin();
    } catch (error) {
      console.error('Permission isSuperAdmin error:', error);
      return false;
    }
  }
};

export default permissionService;
