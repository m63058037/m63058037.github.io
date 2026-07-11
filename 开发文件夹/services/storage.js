import { supabase, config } from '../config/supabase.js';

function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

const ALLOWED_AVATAR_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_POST_IMAGES = 9;
const MAX_POST_IMAGE_SIZE = 10 * 1024 * 1024;
const POST_IMAGES_BUCKET = config.postImageStoragePath || 'post-images';

export const storageService = {
  async uploadAvatar(file, userId) {
    try {
      if (!file || !userId) {
        return createResponse(false, null, '参数错误', 400);
      }

      const fileExt = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_AVATAR_EXTENSIONS.includes(fileExt)) {
        return createResponse(false, null, '不支持的图片格式，仅支持 jpg/jpeg/png/webp', 400);
      }

      if (file.size > MAX_AVATAR_SIZE) {
        return createResponse(false, null, '图片大小不能超过5MB', 400);
      }

      const uniqueFileName = `avatar-${userId}-${Date.now()}.${fileExt}`;
      const filePath = `${userId}/${uniqueFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage uploadAvatar error:', uploadError);
        return createResponse(false, null, uploadError.message, 500);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return createResponse(true, {
        url: publicUrl,
        path: filePath,
        fileName: uniqueFileName
      }, '头像上传成功', 200);
    } catch (error) {
      console.error('Storage uploadAvatar exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async uploadPostImages(files, postId) {
    try {
      console.log('[DEBUG storageService] uploadPostImages called');
      console.log('[DEBUG storageService] files:', files);
      console.log('[DEBUG storageService] files.length:', files?.length);
      console.log('[DEBUG storageService] postId:', postId);
      console.log('[DEBUG storageService] POST_IMAGES_BUCKET:', POST_IMAGES_BUCKET);

      if (!files || !postId || files.length === 0) {
        console.log('[DEBUG storageService] Invalid parameters');
        return createResponse(false, null, '参数错误', 400);
      }

      if (files.length > MAX_POST_IMAGES) {
        return createResponse(false, null, `最多只能上传${MAX_POST_IMAGES}张图片`, 400);
      }

      const uploadedImages = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log('[DEBUG storageService] Processing file:', file.name, file.size, file.type);
        
        const fileExt = file.name.split('.').pop().toLowerCase();

        if (!ALLOWED_AVATAR_EXTENSIONS.includes(fileExt)) {
          return createResponse(false, null, `第${i + 1}张图片格式不支持，仅支持 jpg/jpeg/png/webp`, 400);
        }

        if (file.size > MAX_POST_IMAGE_SIZE) {
          return createResponse(false, null, `第${i + 1}张图片大小不能超过10MB`, 400);
        }

        const uniqueFileName = `image-${i + 1}-${Date.now()}.${fileExt}`;
        const filePath = `${postId}/${uniqueFileName}`;
        console.log('[DEBUG storageService] Uploading to:', POST_IMAGES_BUCKET, filePath);

        const { error: uploadError } = await supabase.storage
          .from(POST_IMAGES_BUCKET)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('[ERROR storageService] Upload error:', uploadError);
          return createResponse(false, null, uploadError.message, 500);
        }

        console.log('[DEBUG storageService] File uploaded successfully:', filePath);

        const { data: { publicUrl } } = supabase.storage
          .from(POST_IMAGES_BUCKET)
          .getPublicUrl(filePath);

        const cleanedUrl = publicUrl.trim().replace(/^`|`$/g, '');

        uploadedImages.push({
          url: cleanedUrl,
          path: filePath,
          fileName: uniqueFileName,
          sortOrder: i
        });
      }

      console.log('[DEBUG storageService] All files uploaded successfully:', uploadedImages.length);
      return createResponse(true, uploadedImages, '图片上传成功', 200);
    } catch (error) {
      console.error('[ERROR storageService] uploadPostImages exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async deleteImage(bucketName, filePath) {
    try {
      if (!bucketName || !filePath) {
        return createResponse(false, null, '参数错误', 400);
      }

      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);

      if (error) {
        console.error('Storage deleteImage error:', error);
        return createResponse(false, null, error.message, 500);
      }

      return createResponse(true, null, '图片删除成功', 200);
    } catch (error) {
      console.error('Storage deleteImage exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  async getPublicUrl(bucketName, filePath) {
    try {
      if (!bucketName || !filePath) {
        return createResponse(false, null, '参数错误', 400);
      }

      const { data: { publicUrl }, error } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);

      if (error) {
        console.error('Storage getPublicUrl error:', error);
        return createResponse(false, null, error.message, 500);
      }

      return createResponse(true, publicUrl, '', 200);
    } catch (error) {
      console.error('Storage getPublicUrl exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  }
};

export default storageService;