import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import { stripHtml } from "string-strip-html";
import dotenv from "dotenv";
import cors from "cors";
import dayjs from "dayjs";
import Joi from "joi";

const OK = 200;
const CREATED = 201;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const INTERNAL_SERVER_ERROR = 500;
const PORT = 5000;

const server = express();
dotenv.config();
server.use(cors());
server.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);

try {
  await mongoClient.connect();
} catch (error) {
  console.log("Erro ao se conectar ao banco de dados", error.message);
}
const db = mongoClient.db();

const userSchema = Joi.object({
  name: Joi.string().required(),
});
const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.any().valid("message", "private_message").required(),
});
const messageIdSchema = Joi.object({
  messageId: Joi.string().hex().length(24),
});

server.post("/participants", async (request, response) => {
  const nameBody = request.body.name;
  const { error } = userSchema.validate({ name: nameBody });
  try {
    if (!error) {
      const name = sanitizeUserName(nameBody);
      if (await nameIsAlreadyRegistered(name)) {
        return response.status(CONFLICT).send("Usuário já cadastrado");
      }
      const userRegister = { name, lastStatus: Date.now() };
      await db.collection("participants").insertOne(userRegister);
      const loginMessage = {
        from: name,
        to: "Todos",
        text: "Entra na sala...",
        type: "status",
        time: timeNow(),
      };
      await db.collection("messages").insertOne(loginMessage);
      response.sendStatus(CREATED);
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (err) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.get("/participants", async (request, response) => {
  try {
    const usersList = await db.collection("participants").find().toArray();
    response.status(OK).send(usersList);
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.post("/messages", async (request, response) => {
  const messageBody = request.body;
  const { user: from } = request.headers;
  const { error } = messageSchema.validate(messageBody);
  try {
    if (!error) {
      const { to, text, type } = sanitizeMessage(messageBody);
      if (!(await nameIsAlreadyRegistered(from))) {
        return response.status(UNPROCESSABLE).send("Usuário não encontrado");
      }
      const message = {
        from,
        to,
        text,
        type,
        time: timeNow(),
      };
      await db.collection("messages").insertOne(message);
      response.sendStatus(CREATED);
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.get("/messages", async (request, response) => {
  const { limit } = request.query;
  const { user } = request.headers;
  try {
    const messageList = await db
      .collection("messages")
      .find({
        $or: [
          { type: "message" },
          { to: user },
          { to: "Todos" },
          { from: user },
        ],
      })
      .toArray();
    if (!limit) {
      return response.status(OK).send([...messageList].reverse());
    } else if (Number(limit) && limit > 0) {
      return response.status(OK).send([...messageList].slice(-limit).reverse());
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.delete("/messages/:messageId", async (request, response) => {
  const { user } = request.headers;
  const { messageId } = request.params;
  const { error } = messageIdSchema.validate({ messageId });
  try {
    if (!error) {
      const isExistMessage = await db
        .collection("messages")
        .findOne({ _id: ObjectId(messageId) });
      if (!isExistMessage) {
        return response.sendStatus(NOT_FOUND);
      } else if (isExistMessage.from !== user) {
        return response.sendStatus(UNAUTHORIZED);
      }
      await db.collection("messages").deleteOne({ _id: ObjectId(messageId) });
      response.sendStatus(OK);
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.put("/messages/:messageId", async (request, response) => {
  const messageBody = request.body;
  const { user: from } = request.headers;
  const { messageId } = request.params;
  const { error: messageError } = messageSchema.validate(messageBody);
  const { error: messageIdError } = messageIdSchema.validate({ messageId });
  try {
    if (!messageError && !messageIdError) {
      const {to, text, type} = sanitizeMessage(messageBody);
      if (!(await nameIsAlreadyRegistered(from))) {
        return response.status(UNPROCESSABLE).send("Usuário não encontrado");
      }
      const isExistMessage = await db
        .collection("messages")
        .findOne({ _id: ObjectId(messageId) });
      if (!isExistMessage) {
        return response.sendStatus(NOT_FOUND);
      } else if (isExistMessage.from !== from) {
        return response.sendStatus(UNAUTHORIZED);
      }
      const message = {
        from,
        to,
        text,
        type,
        time: timeNow(),
      };
      await db
        .collection("messages")
        .updateOne({ _id: ObjectId(messageId) }, { $set: message });
      response.sendStatus(OK);
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.post("/status", async (request, response) => {
  const { user } = request.headers;
  try {
    if (!(await nameIsAlreadyRegistered(user))) {
      return response.sendStatus(NOT_FOUND);
    }
    console.log("lalaal")
    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    response.sendStatus(OK);
  } catch (error) {
    response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
setInterval(async () => {
  const minimumTimeAllowed = Date.now() - 10000;
  try {
    const absentUsers = await db
      .collection("participants")
      .find({ lastStatus: { $lt: minimumTimeAllowed } })
      .toArray();
    if (absentUsers.length) {
      const leftMessageList = absentUsers.map(({ name }) => {
        return {
          from: name,
          to: "Todos",
          text: "sai da sala...",
          type: "status",
          time: timeNow(),
        };
      });
      await db.collection("messages").insertMany(leftMessageList);
      await db
        .collection("participants")
        .deleteMany({ lastStatus: { $lt: minimumTimeAllowed } });
    }
  } catch (error) {
    console.log(error);
  }
}, 15000);

const timeNow = () => dayjs().format("HH:mm:ss");
const nameIsAlreadyRegistered = (name) =>
  db.collection("participants").findOne({ name });
const sanitizeUserName = (name) => stripHtml(name).result.trim();
const sanitizeMessage = (bodyMessage) => {
  return {
    to: stripHtml(bodyMessage.to).result.trim(),
    text: stripHtml(bodyMessage.text).result.trim(),
    type: stripHtml(bodyMessage.type).result.trim(),
  };
};
server.listen(PORT, () => console.log(PORT));
