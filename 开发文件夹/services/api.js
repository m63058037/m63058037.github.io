import { supabase } from '../config/supabase.js';

/**
 * API响应封装
 * @param {boolean} success - 是否成功
 * @param {any} data - 数据
 * @param {string} message - 消息
 * @param {number} statusCode - 状态码
 * @returns {object} 响应对象
 */
function createResponse(success, data = null, message = '', statusCode = 200) {
  return {
    success,
    data,
    message,
    statusCode
  };
}

/**
 * API服务层
 * 所有数据库操作必须经过此层
 */
export const apiService = {
  /**
   * 通用查询方法
   * @param {string} table - 表名
   * @param {object} options - 查询选项
   * @returns {Promise<object>} 响应对象
   */
  async query(table, options = {}) {
    try {
      const { select = '*', filter = {}, order = [], limit = null, offset = null } = options;
      
      let query = supabase.from(table).select(select);
      
      if (filter && Object.keys(filter).length > 0) {
        for (const [key, value] of Object.entries(filter)) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      }
      
      if (order && order.length > 0) {
        order.forEach(({ column, ascending = true }) => {
          query = query.order(column, { ascending });
        });
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      if (offset) {
        query = query.offset(offset);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('API query error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, data, '', 200);
    } catch (error) {
      console.error('API query exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 通用插入方法
   * @param {string} table - 表名
   * @param {object} data - 插入数据
   * @param {boolean} returning - 是否返回插入的数据
   * @returns {Promise<object>} 响应对象
   */
  async insert(table, data, returning = true) {
    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select(returning ? '*' : null);
      
      if (error) {
        console.error('API insert error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, result, '', 201);
    } catch (error) {
      console.error('API insert exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 通用更新方法
   * @param {string} table - 表名
   * @param {object} data - 更新数据
   * @param {object} filter - 过滤条件
   * @param {boolean} returning - 是否返回更新的数据
   * @returns {Promise<object>} 响应对象
   */
  async update(table, data, filter, returning = true) {
    try {
      let query = supabase.from(table).update(data);
      
      if (filter && Object.keys(filter).length > 0) {
        for (const [key, value] of Object.entries(filter)) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      }
      
      const { data: result, error } = await query.select(returning ? '*' : null);
      
      if (error) {
        console.error('API update error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, result, '', 200);
    } catch (error) {
      console.error('API update exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 通用删除方法
   * @param {string} table - 表名
   * @param {object} filter - 过滤条件
   * @param {boolean} returning - 是否返回删除的数据
   * @returns {Promise<object>} 响应对象
   */
  async delete(table, filter, returning = true) {
    try {
      let query = supabase.from(table).delete();
      
      if (filter && Object.keys(filter).length > 0) {
        for (const [key, value] of Object.entries(filter)) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      }
      
      const { data: result, error } = await query.select(returning ? '*' : null);
      
      if (error) {
        console.error('API delete error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, result, '', 200);
    } catch (error) {
      console.error('API delete exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 查询单条记录
   * @param {string} table - 表名
   * @param {object} filter - 过滤条件
   * @param {string} select - 选择字段
   * @returns {Promise<object>} 响应对象
   */
  async findOne(table, filter, select = '*') {
    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .match(filter)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          return createResponse(true, null, '', 404);
        }
        console.error('API findOne error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, data, '', 200);
    } catch (error) {
      console.error('API findOne exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 分页查询
   * @param {string} table - 表名
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页大小
   * @param {object} options - 查询选项
   * @returns {Promise<object>} 响应对象
   */
  async paginate(table, page = 1, pageSize = 10, options = {}) {
    try {
      const { select = '*', filter = {}, order = [] } = options;
      const offset = (page - 1) * pageSize;
      
      let query = supabase.from(table).select(select, { count: 'exact' });
      
      if (filter && Object.keys(filter).length > 0) {
        for (const [key, value] of Object.entries(filter)) {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
      }
      
      if (order && order.length > 0) {
        order.forEach(({ column, ascending = true }) => {
          query = query.order(column, { ascending });
        });
      }
      
      query = query.range(offset, offset + pageSize - 1);
      
      const { data, count, error } = await query;
      
      if (error) {
        console.error('API paginate error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      const totalPages = Math.ceil(count / pageSize);
      
      return createResponse(true, {
        data,
        pagination: {
          page,
          pageSize,
          total: count,
          totalPages
        }
      }, '', 200);
    } catch (error) {
      console.error('API paginate exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 执行存储过程
   * @param {string} functionName - 函数名
   * @param {any[]} params - 参数数组
   * @returns {Promise<object>} 响应对象
   */
  async rpc(functionName, params = {}) {
    try {
      const { data, error } = await supabase.rpc(functionName, params);
      
      if (error) {
        console.error('API rpc error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, data, '', 200);
    } catch (error) {
      console.error('API rpc exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 批量插入
   * @param {string} table - 表名
   * @param {object[]} data - 数据数组
   * @returns {Promise<object>} 响应对象
   */
  async bulkInsert(table, data) {
    try {
      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select();
      
      if (error) {
        console.error('API bulkInsert error:', error);
        return createResponse(false, null, error.message, error.status || 500);
      }
      
      return createResponse(true, result, '', 201);
    } catch (error) {
      console.error('API bulkInsert exception:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  /**
   * 事务操作（需要服务端）
   * @param {function} callback - 事务回调函数
   * @returns {Promise<object>} 响应对象
   */
  async transaction(callback) {
    try {
      const result = await callback(supabase);
      return createResponse(true, result, '', 200);
    } catch (error) {
      console.error('API transaction error:', error);
      return createResponse(false, null, error.message, 500);
    }
  },

  };

export default apiService;