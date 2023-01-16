import express, { request, response } from "express";
import { MongoClient, ObjectId } from "mongodb";
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

server.post("/participants", async (request, response) => {
  const { name } = request.body;
  try {
    const { error } = userSchema.validate({ name });
    if (!error) {
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
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.get("/participants", async (request, response) => {
  try {
    const usersList = await db.collection("participants").find().toArray();
    response.status(OK).send(usersList);
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.post("/messages", async (request, response) => {
  const { to, text, type } = request.body;
  const { user: from } = request.headers;
  const { error } = messageSchema.validate({ to, text, type });
  try {
    if (!error) {
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
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.get("/messages", async (request, response) => {
  const { limit } = request.query;
  const { user } = request.headers;
  try {
    const messageList = await db
      .collection("messages")
      .find({ $or: [{ type: "message" }, { to: user }, { from: user }] })
      .toArray();
    if (!limit) {
      return response.status(OK).send([...messageList].reverse());
    } else if (Number(limit) && limit > 0) {
      return response.status(OK).send([...messageList].slice(-limit).reverse());
    } else {
      return response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.delete("/messages/:messageId", async (request, response) => {
  const { user } = request.headers;
  const { messageId } = request.params;
  try {
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
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.put("/messages/:messageId", async (request, response) => {
  const { to, text, type } = request.body;
  const { user: from } = request.headers;
  const { messageId } = request.params;
  const { error } = messageSchema.validate({ to, text, type });
  try {
    if (!error) {
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
      response.sendStatus(CREATED);
    } else {
      response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.post("/status", async (request, response) => {
  const { user } = request.headers;
  try {
    if (!(await nameIsAlreadyRegistered(from))) {
      return response.sendStatus(NOT_FOUND);
    }
    await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    response.sendStatus(OK);
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
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
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
}, 2000);

const timeNow = () => dayjs().format("HH:mm:ss");
const nameIsAlreadyRegistered = (name) =>
  db.collection("participants").findOne({ name });

server.listen(PORT, () => console.log(PORT));
