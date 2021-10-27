import { ApolloGateway } from "@apollo/gateway";
import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import express from "express";
import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  introspectionFromSchema,
} from "graphql";

/** @type {Map<string, express.Router>} */
const gatewayCache = new Map();

/**
 * Generate an Apollo Server instance configured to use managed federation for
 * the given graphRef. Uses a cache to avoid creating unnecessary instances.
 * @param {string} graphRef
 */
async function makeGateway(graphRef) {
  if (gatewayCache.has(graphRef)) {
    return /** @type {express.Router} */ (gatewayCache.get(graphRef));
  }

  const gateway = new ApolloGateway();

  const server = new ApolloServer({
    gateway,
    apollo: {
      graphRef: graphRef,
    },
  });

  // this is silly but it's the easiest way to display error messages in sandbox.
  try {
    await server.start();
  } catch (/** @type {any} */ e) {
    return (
      /** @type {express.Request} */ _req,
      /** @type {express.Response} */ res
    ) => {
      res.json({ data: schemaForError(e?.message ?? "Unknown error") });
    };
  }

  const middleware = server.getMiddleware();
  gatewayCache.set(graphRef, middleware);

  return middleware;
}

/**
 * Makes a dummy schema for presenting errors in Apollo Sandbox as a type description.
 * @param {string} message
 */
function schemaForError(message) {
  const newGraphQLSchema = new GraphQLSchema({
    query: new GraphQLObjectType({
      name: "Query",
      description: `Error fetching schema: ${message}`,
      fields: {
        somethingWentWrong: {
          type: GraphQLString,
        },
      },
    }),
  });

  return introspectionFromSchema(newGraphQLSchema);
}

const app = express();
app.use(cors());
app.get("/", (_, res) => res.redirect("/graphql"));

/**
 * Delegates to Apollo Server instances based on the graphRef specified as a
 * request header.
 */
app.use(async (req, res, next) => {
  const graphRef = req.header("x-graphref");

  if (graphRef) {
    const middleware = await makeGateway(graphRef);
    middleware(req, res, next);
  } else {
    if (req.header("content-type")?.startsWith("application/json")) {
      res.json({
        data: schemaForError(
          "Set the x-graphref header to specify the graph you want to use"
        ),
      });
    } else {
      res.redirect(
        "https://studio.apollographql.com/sandbox/explorer?endpoint=http://localhost:4000/graphql"
      );
    }
  }
});

app.listen(4000, () => console.log("Server started: http://localhost:4000"));
