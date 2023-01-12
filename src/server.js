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
const USERS = "participants";

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
      .collection(USERS)
      .findOne({ name });

    if (nameIsAlreadyRegistered) {
      return response.status(CONFLICT).send("Usuário já cadastrado");
    }
    const userRegister = { name, lastStatus: Date.now() };
    await db.collection(USERS).insertOne(userRegister);
    const loginMessage = {
      from: name,
      to: "Todos",
      text: "Entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    };
    await db.collection("messages").insertOne(loginMessage);
    response.sendStatus(CREATED);
  } catch (err) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});
server.get("/participants", async (request, response) => {
  try {
    const usersList = await db.collection(USERS).find().toArray();
    response.status(200).send(usersList);
  } catch (error) {
    return response.status(INTERNAL_SERVER_ERROR).send("Erro no servidor!");
  }
});

server.listen(process.env.PORT, () => console.log(process.env.PORT));
