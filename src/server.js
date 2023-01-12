import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";
import dayjs from "dayjs";

const OK = 200;
const CREATED = 201;
const CONFLICT = 409;
const UNPROCESSABLE = 422;
const INTERNAL_SERVER_ERROR = 500;

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

server.post("/participants", async (request, response) => {
  const { name } = request.body;
  try {
    const nameIsAlreadyRegistered = await db
      .collection("participants")
      .findOne({ name });

    if (nameIsAlreadyRegistered) {
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

  try {
    const nameIsAlreadyRegistered = await db
      .collection("participants")
      .findOne({ name: from });
    if (!nameIsAlreadyRegistered) {
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
      .find({ $or: [{ to: "Todos" }, { to: user }, { from: user }] })
      .toArray();
    if (!limit) {
      return response.status(OK).send(messageList);
    } else if (Number(limit) && limit > 0) {
      return response.status(OK).send(messageList.slice(-limit));
    } else {
      return response.sendStatus(UNPROCESSABLE);
    }
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});

const timeNow = () => dayjs().format("HH:mm:ss");

server.listen(process.env.PORT, () => console.log(process.env.PORT));
