import express, { Express, NextFunction, Request, Response } from 'express';
import * as dotenv from 'dotenv';
import Nedb from 'nedb';
import jwt, { Secret } from 'jsonwebtoken';
import { SvitloData } from '../interfaces/svitlo-data';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import { format } from 'date-fns';
import { botApp, sendMessage } from './chat-bot';
import { db, findClosest } from './utils';

const router = express.Router();

dotenv.config({ path: '.env' });

const app: Express = express();
// const db = new Nedb<SvitloData>({ filename: process.env.DB_PATH, autoload: true });

const swaggerDocs = () => {
  const swaggerJSDocOptions: swaggerJSDoc.Options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Svitlo E',
        version: '2.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            description: 'JWT Authorization header using the Bearer scheme.',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          SvitloData: {
            type: 'object',
            properties: {
              light: {
                type: 'number',
                description: 'The light value.',
              },
              timestamp: {
                type: 'string',
                format: 'date-time',
                description: 'The timestamp when the light value was measured.',
              },
            },
            required: ['light', 'timestamp'],
          },
        },
        responses: {
          UnauthorizedError: {
            description: 'A response that indicates the client is not authorized to perform the requested operation.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      description: 'A message describing the error.',
                    },
                  },
                  required: ['message'],
                  example: {
                    message: 'Unauthorized',
                  },
                },
              },
            },
          },
        },
      },
    },
    apis: ['./src/server/*.ts'],
  };

  router.use('/api-docs', swaggerUi.serve);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerJSDoc(swaggerJSDocOptions)));
};

if (process.argv.includes('--develop') || !!process.env.DEVELOP) {
  swaggerDocs();
}

app.use(express.json());

app.use(botApp);

const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.TOKEN_SECRET as Secret, (err, data) => {
    if (err) {
      return res.sendStatus(403);
    }

    req.body.area = (data as { area: string }).area;

    next();
  });
};

const areas: { [key: string]: string } = {
  rad0: 'rad0',
  rad1: 'rad1',
  rad2: 'rad2',
};

const getArea = (areaId: string): string => {
  return areas[areaId];
};

/**
 * @openapi
 * /light:
 *   post:
 *     summary: Create a new record for a light event.
 *     tags:
 *       - Svitlo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               light:
 *                 type: boolean
 *                 description: Whether the light is on or off.
 *               area:
 *                 type: string
 *                 description: The ID of the area to add light data for.
 *             required:
 *               - light
 *               - area
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               example: zaeb-ok
 *       '401':
 *         $ref: '#/components/responses/UnauthorizedError'
 *       '500':
 *         description: Internal Server Error
 */
app.post('/light', authenticateToken, (req, res, next) => {
  const { light, area } = req.body;

  console.log('payoad', new Date(), light, area);

  if (light == null || area == null) {
    res.send('not-ok');
    return;
  }

  const timestamp = Date.now();

  db.insert({
    timestamp,
    light: !!light,
    area: getArea(area),
  });

  const closestTime = findClosest(!!light, timestamp);
  sendMessage(+process.env.RADUJNY_CHAT_ID!, {
    timestamp,
    light: !!light,
    ...(closestTime && { nextStateTime: format(closestTime, 'HH:mm') }),
  });

  res.send('zaeb-ok');
});

/**
 * @openapi
 * /light/{id}?:
 *   get:
 *     tags:
 *     - Svitlo
 *     summary: Retrieve light data for the specified area or all areas.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         allowEmptyValue: true
 *         description: The ID of the area to retrieve light data for.
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SvitloData'
 *       '500':
 *         description: Internal Server Error
 * @param {Object} req - The HTTP request object.
 * @param {Object} req.params - The parameters passed in the URL, including an optional "id" parameter representing the area.
 * @param {String} [req.params.id] - The optional "id" parameter representing the area.
 * @param {Object} res - The HTTP response object.
 * @returns {Object} The light data for the specified area or all areas.
 * @throws {Error} If an error occurs while retrieving the data.
 */
app.get('/light/:id(rad\\d+)?', (req, res) => {
  (db as any)
    .findOne(req.params.id ? { area: getArea(req.params.id) } : {}, { light: 1, timestamp: 1, _id: 0 })
    .sort({ timestamp: -1 })
    .exec((err: Error, data: SvitloData) => {

      if (err) {
        res.status(500).send();
      }
      const closestTime = findClosest(data.light, data.timestamp);
      res.send({
        ...data,
        ...(closestTime && { nextStateTime: format(closestTime, 'HH:mm') }),
      });
    });
});

/**
 * Retrieve light data for all areas or the specified area.
 *
 * @openapi
 * /light/all/{id}?:
 *   get:
 *     tags:
 *     - Svitlo
 *     summary: Retrieve light data for all areas or the specified area.
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         allowEmptyValue: true
 *         description: The ID of the area to retrieve light data for.
 *     responses:
 *       '200':
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SvitloData'
 *       '500':
 *         description: Internal Server Error
 */
app.get('/light/all/:id(rad\\d+)?', (req, res) => {
  db.find(req.params.id ? { area: getArea(req.params.id) } : {}, { light: 1, timestamp: 1, _id: 0 })
    .sort({ timestamp: -1 })
    .limit(parseInt((req.query.limit as string) || '0', 10))
    .exec((err: Error | null, data: SvitloData[]) => {
      if (err) {
        res.status(500).send();
      }
      res.send(data);
    });
});

app.listen(process.env.PORT, () => {
  console.log('Server is up on port ' + process.env.PORT);
});
