const path = require("path")
const fs = require("fs");
const { Scenes } = require("telegraf");

const ordersFilePath = path.join(__dirname, "orders.json")

const supportedFormats = ["txt", "xlsx", "xls"]

const cancelButton = { text: "Отмена", callback_data: "cancel" }

const domainScene = new Scenes.WizardScene(
    "domainScene",
    async (ctx) => {
        await ctx.reply("Введите домен\nЕсли их несколько, то каждый с новой строки. Пример:\nexample1.com\nexample2.com", {reply_markup: {inline_keyboard: [[cancelButton]]}}).catch(err => console.log(err));
        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.callbackQuery?.data == "cancel") return await cancelOrder(ctx).catch(err => console.log(err));;
        
        if (ctx.callbackQuery?.data === "back_to_domain") {
            await ctx.answerCbQuery().catch(err => console.log(err));
            ctx.wizard.back();
            return await ctx.wizard.steps[ctx.wizard.cursor](ctx);
        }

        if (!ctx.message || !ctx.message.text) return ctx.reply("Дайте ответ текстом").catch(err => console.log(err));
        ctx.wizard.state.domains = ctx.message.text.split("\n").map(d => d.trim());
        var messageText = "Введите ключевые слова:"
        for (var supportedFormat of supportedFormats) messageText += `\n- Файл .${supportedFormat}`
        messageText += "\n- Ссылка на Топвизор (Пример: https://tpv.sr/uhHFV4-9C/)"
        await ctx.reply(messageText, {reply_markup: {inline_keyboard: [[{ text: "Пропустить", callback_data: "skip" }], [{ text: "Назад", callback_data: "back_to_domain" }], [cancelButton]]}}).catch(err => console.log(err));

        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.callbackQuery?.data == "cancel") return await cancelOrder(ctx).catch(err => console.log(err));
        
        if (ctx.callbackQuery?.data === "back_to_domain") {
            await ctx.answerCbQuery().catch(err => console.log(err));
            ctx.wizard.back();
            return await ctx.wizard.steps[ctx.wizard.cursor](ctx);
        }

        var text = ctx?.message?.text;
        var file = ctx?.message?.document;
        var keywordsAreSkipped = ctx?.callbackQuery?.data == "skip"

        console.log(file)

        var messageText = "Некорректный ввод\nОтправьте ключевые слова:"
        for (var supportedFormat of supportedFormats) messageText += `\n- Файл .${supportedFormat}`
        messageText += "\n- Ссылка на Топвизор (Пример: https://tpv.sr/uhHFV4-9C/)"

        var fileIsSupported = file?.file_name && supportedFormats.some(format => file.file_name.endsWith(`.${format}`));
        if (!text?.startsWith("https://tpv.sr/") && !fileIsSupported && !keywordsAreSkipped) return await ctx.reply(messageText, {reply_markup: {inline_keyboard: [[{ text: "Назад", callback_data: "back_to_domain" }], [cancelButton]]}}).catch(err => console.log(err));

        ctx.wizard.state.keywords = fileIsSupported ? `file_id: ${file.file_id}` : text;
        if(keywordsAreSkipped) ctx.wizard.state.keywords = "skipped"
        
        var moreThenOneDomain = ctx.wizard.state.domains.length > 1

        await ctx.reply("Выберите действие:", {
            reply_markup: {inline_keyboard: 
            [
                [{ text: `Запустить тест${moreThenOneDomain ? "ы" : ""}`, callback_data: "test" }],
                [{ text: `Запустить в работу`, callback_data: "work" }],
                [{ text: `Произвести правки`, callback_data: "edit" }],
                [{ text: `Поставить на стоп`, callback_data: "stop" }],
                [{ text: "Назад", callback_data: "back_to_keywords" }], 
                [cancelButton]
            ]}
        }).catch(err => console.log(err));

        return ctx.wizard.next();
    },
    async (ctx) => {
        if(ctx.callbackQuery?.data == "cancel") return await cancelOrder(ctx);
        
        if (ctx.callbackQuery?.data === "back_to_keywords") {
            await ctx.answerCbQuery();
            ctx.wizard.back();
            return await ctx.wizard.steps[ctx.wizard.cursor](ctx);
        }

        if (!ctx.callbackQuery) return;
        var action = ctx.callbackQuery.data;

        ctx.wizard.state.action = action;

        var moreThenOneDomain = ctx.wizard.state.domains.length > 1
        var orderId = await getNewId().catch(err => console.log(err))

        var statusToAnswer = {
            test: `Тест${moreThenOneDomain ? "ы" : ""} запущен${moreThenOneDomain ? "ы" : ""}`, 
            work: `Проект${moreThenOneDomain ? "ы" : ""} запущен${moreThenOneDomain ? "ы" : ""}`, 
            edit: `Правки произведены`, 
            stop: `Проект${moreThenOneDomain ? "ы" : ""} отключен${moreThenOneDomain ? "ы" : ""}`
        }

        var statusToText = {
            test: `Домен${moreThenOneDomain ? "ы" : ""} на тест`,
            work: `Домен${moreThenOneDomain ? "ы" : ""} в работу`,
            edit: `Домен${moreThenOneDomain ? "ы" : ""} на правки`,
            stop: `Домен${moreThenOneDomain ? "ы" : ""} на стоп`
        };

        var containsFile = ctx.wizard.state.keywords.startsWith("file_id");
        var keywordsAreSkipped = ctx.wizard.state.keywords == "skipped"
        var messageText = `<b>${statusToText[action]}</b>\n\nДомены:\n${ctx.wizard.state.domains.join("\n")}`;
        if (!keywordsAreSkipped) messageText += `\n\nКлючевые слова: ${containsFile ? "в файле" : `${ctx.wizard.state.keywords}`}`

        var statusToButton = {
            test: [{ text: statusToAnswer[action], callback_data: `test_done${orderId}` }],
            work: [{ text: statusToAnswer[action], callback_data: `work_done${orderId}` }],
            edit: [{ text: statusToAnswer[action], callback_data: `edit_done${orderId}` }],
            stop: [{ text: statusToAnswer[action], callback_data: `stop_done${orderId}` }]
        };

        var adminChatId = process.env.adminChatId;
        var inlineKeyboard = [statusToButton[action]];
        if (containsFile) ctx.wizard.state.adminsMessage = await ctx.telegram.sendDocument(adminChatId, ctx.wizard.state.keywords.replace("file_id: ", ""), {reply_markup: {inline_keyboard: inlineKeyboard}, caption: messageText, parse_mode: "HTML" }).catch(err => console.log(err));
        else ctx.wizard.state.adminsMessage = await ctx.telegram.sendMessage(adminChatId, messageText, {reply_markup: {inline_keyboard: inlineKeyboard}, parse_mode: "HTML"}).catch(err => console.log(err));
        const { chat, message_id } = ctx.wizard.state.adminsMessage
        
        var adminsMessage = {
            chatId: chat.id,
            messageId: message_id,
            buttonText: statusToAnswer[action],
            buttonTouched: false
        }

        await writeNewOrder(orderId, ctx.from.id, ctx.wizard.state.domains, statusToAnswer[action], adminsMessage).catch(err => console.log(err))
        
        await ctx.reply("Ваш заказ передан в тех отдел. Ожидайте").catch(err => console.log(err));
        await ctx.reply(`<b>Для нового заказа нажмите /start</b>`, {parse_mode: "HTML"}).catch(err => console.log(err))

        return ctx.scene.leave().catch(err => console.log(err));
    }
);

async function cancelOrder(ctx) {
    await ctx.reply("Заказ отменен, для новой заявки нажмите /start").catch(err => console.log(err));
    return ctx.scene.leave().catch(err => console.log(err));
}

async function getNewId() {
    if(!fs.existsSync(ordersFilePath)) fs.writeFileSync(ordersFilePath, "[]", "utf-8")
    var orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));
    var lastOrderId = 0
    if(orders.length != 0) lastOrderId = orders[orders.length - 1].orderId
    return lastOrderId + 1
}

async function writeNewOrder(orderId, chatId, domains, answer, adminsMessage) {
    if(!fs.existsSync(ordersFilePath)) fs.writeFileSync(ordersFilePath, "[]", "utf-8")
    var orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));
    orders.push({orderId, chatId, domains, answer, adminsMessage})
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 4), "utf-8")
}

module.exports = domainScene;
