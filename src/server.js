import express from "express";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import cors from "cors";

const server = express();
dotenv.config();
server.use(cors());
server.use(express.json());

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;

try {
  await mongoClient.connect();
} catch (error) {
  console.log("Erro ao se conectar ao banco de dados", error.message);
}

db = mongoClient.db(""); //Adicionar nome do database
const collection = db.collection(""); // criar collection

server.listen(process.env.PORT, () => console.log(process.env.PORT));
