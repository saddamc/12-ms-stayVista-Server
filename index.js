const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 8000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())


    // jwt related api
    app.post('/jwt', async(req, res) =>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'});
        res.send({token});
      })
    





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.m0qpfuk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.mq0mae1.mongodb.net/?retryWrites=true&w=majority&appName=Main`
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {

    const roomsCollection = client.db('stayvista').collection('rooms') 
    const usersCollection = client.db('stayvista').collection('users')
    const bookingsCollection = client.db('stayvista').collection('booking')


    
    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      // console.log('hello')
      const user = req.user
      const query = { email: user?.email }
      const result = await usersCollection.findOne(query)
      if(!result || result?.role !== 'admin') 
        return res.status(401).send({message: "forbidden access!!"})

      next()
    }

    // verify Host middleware
    const verifyHost = async (req, res, next) => {
      // console.log('hello')
      const user = req.user
      const query = { email: user?.email }
      const result = await usersCollection.findOne(query)
      if(!result || result?.role !== 'host') 
        return res.status(401).send({message: "unauthorized access!!"})

      next()
    }

        // Verify Token Middleware
    const verifyToken = async (req, res, next) => {
      const token = req.cookies?.token
      console.log(token)
      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          console.log(err)
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.user = decoded
        next()
      })
    }


    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h',
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })

    // /create-payment-intent
    app.post('/create-payment-intent', async(req, res) => {
      const price = req.body.price
      const priceInCent = parseFloat(price) * 100
      if(!price || priceInCent < 1) return

      // generate payment secret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
    // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
      automatic_payment_methods: {
      enabled: true,
    },
      })
      
      // send client secret as response
      res.send({clientSecret: client_secret})
      
    })



    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })

    // get a user info by email from DB
    app.get('/user/:email', async(req, res) => {
      const email = req.params.email
      const result = await usersCollection.findOne({email})
      res.send(result)
    })

    // save a user data in DB /**1. user SignUp date 2. user role change 3. */
    app.put('/user', async (req, res) => {
      const user = req.body
      const query = { email: user?.email }
      // check if user already exists in DB
      const isExist = usersCollection.findOne(query)
      if(isExist) return res.send(isExist)
        if(isExist) {
          if(user?.status === 'Requested') { 
            const result = await usersCollection.updateOne(query, {
              $set: { status: user?.status },
            })
            return res.send(result)
          }
      
        } else{
          // if existing user login again
          return res.send(isExist)
      }

        // save user for the first time
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(), 
        },
      }
      const result = await usersCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })

    // get all users data from DB 
    app.get('/users', async(req, res) =>{
      const result = await usersCollection.find().toArray()
      res.send(result)
    })

    // update a user =>  role
    app.patch('/users/update/:email', async(req, res) => {
      const email = req.params.email
      const user = req.body
      const query = {email}
      const updateDoc = {
        $set: {...user, timestamp: Date.now() },
      }
      const result = await usersCollection.updateOne(query, updateDoc)
      res.send(result)
    })


    // get all rooms from DB => 01
    app.get('/rooms', async(req, res) => {

      const email = req.query.email;
      // console.log(email)
      let query = {}
      if (email && email !== 'null') query = {email}

      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // Save a room data in DB => 03
    app.post('/room', async (req, res) => {
      const roomData = req.body
      const result = await roomsCollection.insertOne(roomData)
      res.send(result)
    })

    // get all rooms for host => 04
    app.get('/my-listings/:email', async(req, res) => {
      const email = req.params.email;
      let query = {'host.email': email}
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // delete a room
    app.delete('/room/:id', async(req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id)}
      const result = await roomsCollection.deleteOne(query)
      res.send(result)
    })


    // get a single room data from DB using _id => 02
    app.get('/room/:id', async(req, res) => {
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await roomsCollection.findOne(query)
      res.send(result)
    })

        // Save a booking data in DB => 01
        app.post('/booking', async (req, res) => {
          const bookingData = req.body
          const result = await bookingsCollection.insertOne(bookingData)
          res.send(result)
        })



    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from StayVista Server..')
})

app.listen(port, () => {
  console.log(`StayVista is running on port ${port}`)
})
