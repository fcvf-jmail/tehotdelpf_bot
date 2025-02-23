const path = require("path")
const fs = require("fs");
require("dotenv").config({path: path.join(__dirname, ".env")})
const { Telegraf, session } = require("telegraf")
const { Stage } = require("telegraf/scenes")
const domainScene = require("./domainScene")
const bot = new Telegraf(process.env.botToken)

const ordersFilePath = path.join(__dirname, "orders.json")

const stage = new Stage([domainScene])

bot.use(session())
bot.use(stage.middleware())

bot.action(/_done(\d+)$/ig, async ctx => {
    const orderId = ctx.match[1];
    const order = getOrder(orderId)
    var { chatId, messageId, buttonText, buttonTouched } = order.adminsMessage
    
    if (buttonTouched) return await ctx.reply("Этот заказ уже был отработан ранее");
    
    setButtonTouched(orderId)
    
    await ctx.telegram.sendMessage(order.chatId, `<b>✅ ${order.answer}</b>\n\n${order.domains.join("\n")}`, {parse_mode: "HTML"}).catch(err => console.log(err))
    await ctx.telegram.sendMessage(order.chatId, `<b>Для нового заказа нажмите /start</b>`, {parse_mode: "HTML"}).catch(err => console.log(err))

    console.log(buttonText)
    var prefix = "✅"
    if(buttonText.includes("отключен")) prefix = "🛑"

    await ctx.telegram.editMessageReplyMarkup(chatId, messageId, undefined, {inline_keyboard: [[{text: `${prefix} ${buttonText}`, callback_data: "processedOrder"}]]})
})

bot.start(ctx => ctx.scene.enter("domainScene"))

bot.command("getId", ctx => ctx.reply(ctx.chat.id).catch(err => console.log(err)))

function getOrder(orderId) {
    if(!fs.existsSync(ordersFilePath)) fs.writeFileSync(ordersFilePath, "[]", "utf-8")
    const orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));
    return orders.find(order => order.orderId == orderId);
}

bot.telegram.setMyCommands([{command: "start", description: "Создать новый заказ"}])

function setButtonTouched(orderId) {
    if(!fs.existsSync(ordersFilePath)) fs.writeFileSync(ordersFilePath, "[]", "utf-8")
    var orders = JSON.parse(fs.readFileSync(ordersFilePath, "utf-8"));
    orders.find(order => order.orderId == orderId).adminsMessage.buttonTouched = true
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 4), "utf-8")
}

bot.launch()