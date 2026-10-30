import { sequelize } from '../src/services/db.js';
import { Scene } from '../src/models/Scene.js';
import { createModuleLogger } from '../src/config/logger.js';

const log = createModuleLogger('seeder');

const scenesData = [
    {
        sceneId: 'first_scene',
        title: 'Сцена 1: Как перестать крутиться как белка в колесе',
        description: 'Материалы по избавлению от тревоги и чувства вины',
        aliases: ['first', 'branch_first'],
        order: 0,
        steps: [
            {
                stepIndex: 0,
                messages: [
                    {
                        type: 'photo',
                        assetKey: 'first_intro_photo',
                        file: './src/scenes/photo_2026-06-24_15-20-07.jpg',
                        caption: `👌Здесь все  о том, как перестать крутиться как белка в колесе, выкинуть из своей жизни тревогу,  эмоциональные качели и чувство вины.\n\nЯ Мария Руфимская, психолог-коуч с опытом более 18 лет подготовила именно для вас материалы по данной теме.\n\n👇 Читайте прямо сейчас`,
                    },
                    {
                        type: 'text',
                        text: `❓А вы замечали, что нынешний технологический прогресс открывает не только массу плюшек: доступ к информации, возможностям развития и роста, хорошего качества жизни. Но и приносит много проблем...\n\n👌Единственным человеком, который вас выслушает и поддержит - психолог-коуч.\n\n👇Почему так?`,
                        buttons: [[{ text: '➡️ Далее', action: 'next' }]],
                    },
                ],
            },
            {
                stepIndex: 1,
                messages: [
                    {
                        type: 'photo',
                        assetKey: 'first_scheme_photo',
                        file: './src/scenes/photo_2026-06-24_15-50-18.jpg',
                        text: `Взгляните, на схему...\nМы не можем контролировать и влиять на то, что мы не знаем и не осознаем.`,
                    },
                    {
                        type: 'text',
                        text: `‼️Чтобы понять как и с помощью каких техник я работаю, предлагаю продолжить или задать вопрос прямо сейчас`,
                        buttons: [
                            [{ text: '➡️ Далее', action: 'next' }],
                            [{ text: '❓ Задать вопрос', action: 'lead:question' }],
                        ],
                    },
                ],
            },
        ],
    },
    {
        sceneId: 'second_scene',
        title: 'Сцена 2: Как найти новые смыслы (40+)',
        description: 'Материалы для тех, кто ощущает потолок в жизни',
        aliases: ['second', 'branch_second'],
        order: 1,
        steps: [
            {
                stepIndex: 0,
                messages: [
                    {
                        type: 'photo',
                        assetKey: 'second_intro_photo',
                        file: './src/scenes/photo_2026-06-24_15-20-07.jpg',
                        caption: `Здесь все о том, как изменить жизнь, найти новые смыслы и реализоваться, даже если тебе 4⃣0⃣➕...\n\nЧитайте прямо сейчас👇`,
                    },
                    {
                        type: 'text',
                        text: `❓А вы замечали, как меняется наша жизнь с возрастом? Поговорим об этом.`,
                        buttons: [[{ text: '➡️ Далее', action: 'next' }]],
                    },
                ],
            },
        ],
    },
    {
        sceneId: 'thirty_scene',
        title: 'Сцена 3: Собрать себя заново',
        description: 'Материалы для тех, у кого жизнь развалилась',
        aliases: ['third', 'thirty', 'branch_third', 'branch_thirty'],
        order: 2,
        steps: [
            {
                stepIndex: 0,
                messages: [
                    {
                        type: 'photo',
                        assetKey: 'thirty_intro_photo',
                        file: './src/scenes/photo_2026-06-24_15-20-07.jpg',
                        caption: `👌собрать себя заново, даже если предыдущая жизнь развалилась, как карточный домик.\n\n👇Читайте прямо сейчас`,
                    },
                ],
            },
        ],
    },
];

async function seed() {
    try {
        await sequelize.authenticate();
        log.info('connected to mysql for seeding');

        for (const sceneData of scenesData) {
            await Scene.upsert(sceneData);
            log.info(`✅ Seeded scene: ${sceneData.sceneId}`);
        }

        log.info('✅ Seeding completed successfully');
        process.exit(0);
    } catch (error) {
        log.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
