const express = require('express');
const { 
  getShoppingList,
  addShoppingListItem,
  addRecipeToShoppingList,
  updateShoppingListItem,
  deleteShoppingListItem,
  clearCompletedItems,
  clearShoppingList
} = require('../controllers/shoppingListController');
const { 
  validateShoppingListItem,
  validateShoppingListItemCreation,
  validateAddRecipeToShoppingList,
  validateShoppingListQuery
} = require('../middleware/shoppingListValidation');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All shopping list routes require authentication
router.get('/', authenticateToken, validateShoppingListQuery, getShoppingList);
router.post('/items', authenticateToken, validateShoppingListItemCreation, addShoppingListItem);
router.post('/recipes/:id', authenticateToken, validateAddRecipeToShoppingList, addRecipeToShoppingList);
router.put('/items/:itemId', authenticateToken, validateShoppingListItem, updateShoppingListItem);
router.delete('/items/:itemId', authenticateToken, deleteShoppingListItem);
router.delete('/completed', authenticateToken, clearCompletedItems);
router.delete('/clear', authenticateToken, clearShoppingList);

module.exports = router;