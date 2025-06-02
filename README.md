# 🍳 RecipeShare API

A complete recipe sharing platform API built with Node.js, Express, and PostgreSQL. Features user authentication, social interactions, shopping lists, advanced search, and comprehensive recipe management.

## ✨ Features

### 🔐 Authentication & User Management
- JWT-based authentication
- User registration and login
- Profile management with privacy controls
- Password change functionality

### 🍳 Recipe Management
- Create, read, update, delete recipes
- Rich recipe data (ingredients, instructions, timing, difficulty)
- Recipe categories and tagging
- Public/private recipe visibility
- Featured recipes system

### 👥 Social Features
- Follow/unfollow users
- Like and rate recipes (1-5 stars with reviews)
- Threaded comments system
- Personalized feed from followed users
- Trending recipes discovery
- Activity notifications

### 🛒 Shopping Lists
- Personal shopping list management
- Add individual items or entire recipes
- Serving size multipliers
- Mark items as completed
- Shopping list statistics

### 🔍 Advanced Search
- Global search across recipes, users, and ingredients
- Advanced recipe filtering by:
  - Ingredients
  - Categories
  - Difficulty level
  - Preparation/cooking time
  - Rating
  - Multiple sorting options

### 📊 Analytics & Statistics
- Platform-wide statistics
- Personal user statistics
- Recipe performance metrics
- Popular categories tracking

### 📱 Collections
- Favorite recipes collection
- Recipe interaction history
- Personalized recommendations

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ and npm 8+
- PostgreSQL 12+
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/DBOYttt/reciptshare-api.git
cd reciptshare-api
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

4. **Create and setup database**
```bash
# Create database in PostgreSQL
createdb reciptshare_db

# Initialize database schema
curl -X POST http://localhost:3000/api/admin/reset
```

5. **Start the server**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

6. **Verify installation**
```bash
curl http://localhost:3000/api/health
```

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Most endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Quick Examples

#### Register a new user
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "dboyttt",
    "email": "dboyttt@example.com",
    "password": "SecurePass123!",
    "firstName": "DBOYttt",
    "lastName": "Developer"
  }'
```

#### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "emailOrUsername": "dboyttt",
    "password": "SecurePass123!"
  }'
```

#### Create a recipe
```bash
curl -X POST http://localhost:3000/api/recipes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Classic Spaghetti Carbonara",
    "description": "A traditional Italian pasta dish",
    "prepTimeMinutes": 15,
    "cookTimeMinutes": 20,
    "servings": 4,
    "difficulty": "Medium",
    "instructions": [
      "Cook pasta according to package directions",
      "Cook pancetta until crispy",
      "Mix eggs and cheese",
      "Combine everything off heat"
    ],
    "ingredients": [
      {"name": "Spaghetti", "quantity": 400, "unit": "g"},
      {"name": "Pancetta", "quantity": 200, "unit": "g"},
      {"name": "Eggs", "quantity": 4, "unit": "whole"},
      {"name": "Parmesan", "quantity": 100, "unit": "g"}
    ],
    "categoryIds": [13]
  }'
```

### 📖 Full Documentation
- **API Docs**: `GET /api/docs`
- **Schemas**: `GET /api/schemas`
- **Examples**: `GET /api/examples`

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get current user profile
- `GET /api/auth/verify` - Verify JWT token
- `PUT /api/auth/change-password` - Change password

### Users
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/:username` - Get public user profile

### Recipes
- `GET /api/recipes` - List recipes with filters
- `POST /api/recipes` - Create new recipe
- `GET /api/recipes/:id` - Get single recipe
- `PUT /api/recipes/:id` - Update recipe
- `DELETE /api/recipes/:id` - Delete recipe

### Recipe Interactions
- `POST /api/recipes/:id/like` - Like/unlike recipe
- `POST /api/recipes/:id/rate` - Rate recipe
- `GET /api/recipes/:id/ratings` - Get recipe ratings
- `DELETE /api/recipes/:id/rating` - Delete own rating

### Comments
- `POST /api/recipes/:id/comments` - Add comment
- `GET /api/recipes/:id/comments` - Get recipe comments
- `PUT /api/comments/:commentId` - Update comment
- `DELETE /api/comments/:commentId` - Delete comment

### Social Features
- `POST /api/users/:username/follow` - Follow/unfollow user
- `GET /api/users/:username/followers` - Get user followers
- `GET /api/users/:username/following` - Get user following
- `GET /api/suggestions` - Get follow suggestions

### Feeds & Discovery
- `GET /api/feed` - Personal feed
- `GET /api/trending` - Trending recipes
- `GET /api/activity` - User activity notifications

### Shopping Lists
- `GET /api/shopping-list` - Get shopping list
- `POST /api/shopping-list/items` - Add item
- `POST /api/shopping-list/recipes/:id` - Add recipe to list
- `PUT /api/shopping-list/items/:itemId` - Update item
- `DELETE /api/shopping-list/items/:itemId` - Delete item
- `DELETE /api/shopping-list/completed` - Clear completed
- `DELETE /api/shopping-list/clear` - Clear all

### Search
- `GET /api/search?q=query` - Global search
- `GET /api/search/recipes` - Advanced recipe search

### Categories
- `GET /api/categories` - List all categories
- `GET /api/categories/:id` - Get single category

### Statistics
- `GET /api/statistics/platform` - Platform statistics
- `GET /api/statistics/user` - User statistics

### Collections
- `GET /api/collections/favorites` - Favorite recipes
- `GET /api/collections/history` - Recipe history

### Admin
- `GET /api/admin/status` - Database status
- `POST /api/admin/reset` - Reset database
- `POST /api/admin/seed` - Seed sample data

## 🗄️ Database Schema

### Core Tables
- **users** - User accounts and profiles
- **recipes** - Recipe data and metadata
- **recipe_ingredients** - Recipe ingredients with quantities
- **recipe_categories** - Recipe-category relationships
- **categories** - Recipe categories

### Social Tables
- **recipe_likes** - Recipe likes
- **recipe_ratings** - Recipe ratings and reviews
- **recipe_comments** - Recipe comments with threading
- **user_followers** - User follow relationships

### Utility Tables
- **shopping_list_items** - Shopping list management

## 🔒 Security Features

- **Rate Limiting**: Prevents API abuse
- **CORS Protection**: Configurable cross-origin requests
- **Helmet Security**: HTTP security headers
- **JWT Authentication**: Secure token-based auth
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries

## 📊 Performance & Monitoring

- **Database Indexing**: Optimized query performance
- **Pagination**: Efficient data loading
- **Connection Pooling**: Database connection management
- **Health Checks**: System status monitoring
- **Error Handling**: Comprehensive error responses

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Test specific endpoints
npm run health
npm run db:status
```

## 🚀 Deployment

### Environment Variables
Set these in production:
```bash
NODE_ENV=production
DATABASE_URL=your_production_db_url
JWT_SECRET=your_production_jwt_secret
CORS_ORIGIN=your_frontend_domain
```

### Database Setup
```bash
# Production database initialization
curl -X POST https://your-api-domain.com/api/admin/reset
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**DBOYttt**
- GitHub: [@DBOYttt](https://github.com/DBOYttt)
- Email: dboyttt@example.com
---

**Made with ❤️ by DBOYttt** | **Happy Cooking! 🍳**