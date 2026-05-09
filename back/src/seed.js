require('dotenv').config();
const bcrypt = require('bcryptjs');
const { 
  User, 
  Subject, 
  sequelize 
} = require('./models');

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // 1. Создаём предметы
    const subjects = await Subject.bulkCreate([
      { 
        name: 'Математика', 
        description: 'Всё для успешной сдачи ЦТ: от базовых формул до сложных задач', 
        icon: '🔢' 
      },
      { 
        name: 'Физика', 
        description: 'Теория, формулы и практика — всё необходимое для экзамена', 
        icon: '⚛️' 
      },
      { 
        name: 'Химия', 
        description: 'Реакции, формулы и задачи — готовься к ЦТ уверенно', 
        icon: '🧪' 
      },
      { 
        name: 'Биология', 
        description: 'От клетки до экосистем — полная подготовка к экзамену', 
        icon: '🧬' 
      },
      { 
        name: 'Русский язык', 
        description: 'Правила, исключения и тесты для идеального результата', 
        icon: '🇷🇺' 
      },
      { 
        name: 'Белорусский язык', 
        description: 'Граматыка і практыка для дасканалай падрыхтоўкі да ЦТ', 
        icon: '🇧🇾' 
      },
      { 
        name: 'Английский язык', 
        description: 'Грамматика, лексика и тесты для высоких баллов', 
        icon: '🇬🇧' 
      },
      { 
        name: 'История Беларуси', 
        description: 'От древности до наших дней — всё для успешного экзамена', 
        icon: '📜' 
      },
      { 
        name: 'Обществоведение', 
        description: 'Теория и практика для уверенной сдачи ЦТ', 
        icon: '🏛️' 
      }
    ]);
    
    console.log(`✅ Created ${subjects.length} subjects`);

    // 2. Создаём админа
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await User.create({
      email: 'admin@educa.com',
      password: hashedPassword,
      firstName: 'Админ',
      lastName: 'Тестовый',
      role: 'admin',
      isActive: true
    });
    
    console.log(`✅ Created admin user: ${admin.email} (password: admin123)`);

    // 3. Создаём тестового студента
    const testStudent = await User.create({
      telegramId: 123456789,
      telegramUsername: 'test_student',
      firstName: 'Иван',
      lastName: 'Петров',
      role: 'student',
      isActive: true
    });
    
    console.log(`✅ Created test student: ${testStudent.firstName} ${testStudent.lastName} (@${testStudent.telegramUsername})`);

    // 4. Привязываем студента к предметам (Математика, Физика, Русский)
    await testStudent.addSubjects([subjects[0], subjects[1], subjects[4]]);
    
    console.log(`✅ Assigned 3 subjects to test student (Математика, Физика, Русский)`);

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Subjects: ${subjects.length}`);
    console.log(`   - Admin: admin@educa.com / admin123`);
    console.log(`   - Student: @test_student`);
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await sequelize.close();
  }
};

seedDatabase();