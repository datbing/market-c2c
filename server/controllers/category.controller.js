/**
 * Controller danh mục sản phẩm.
 */
import * as Category from '../models/category.model.js';

/** GET /api/categories */
export async function listCategories(req, res) {
  const rows = await Category.findAllWithCount();
  res.json({ success: true, data: rows.map(Category.toCategory) });
}
