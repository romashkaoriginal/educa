require('dotenv').config();
const { sequelize, UserSubject, BotUser } = require('./models');

const fixTables = async () => {
  try {
    console.log('🔧 Fixing database tables...');

    // Пересоздаём только проблемные таблицы
    console.log('📋 Recreating UserSubject and BotUser tables...');
    
    await UserSubject.sync({ force: true });
    console.log('✅ UserSubject table recreated');
    
    await BotUser.sync({ force: true });
    console.log('✅ BotUser table recreated');

    console.log('\n🎉 Tables fixed successfully!');
    console.log('✨ You can now restart the server: npm run dev\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Fix error:', error);
    process.exit(1);
  }
};

fixTables();