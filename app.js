const express = require('express')
const path = require('path')

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const app = express()
app.use(express.json())
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const sqlQuery = `SELECT * FROM user WHERE username='${username}';`
  const userData = await db.get(sqlQuery)
  if (userData !== undefined) {
    response.status(400).send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400).send('Password is too short')
    } else {
      const HashedPassword = await bcrypt.hash(password, 10)
      const sqlQuery1 = `INSERT INTO user (username,password,name,gender)
      VALUES ('${username}','${HashedPassword}','${name}','${gender}');`
      await db.run(sqlQuery1)
      response.status(200).send('User created successfully')
    }
  }
})
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const api2Query = `SELECT * FROM user WHERE username='${username}';`
  const userData = await db.get(api2Query)
  if (userData === undefined) {
    response.status(400).send('Invalid user')
  } else {
    const isValidPassword = await bcrypt.compare(password, userData.password)
    if (isValidPassword === false) {
      response.status(400).send('Invalid password')
    } else {
      const payload = {username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    }
  }
})
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const username = request.username
  const api3Query = `SELECT follower.following_user_id as ids FROM user INNER JOIN follower 
  ON user.user_id=follower.follower_user_id WHERE user.username='${username}';`
  const idList = await db.all(api3Query)
  const userIdList = []
  for (let item of idList) {
    userIdList.push(item.ids)
  }
  const api3Query1 = `SELECT user.username,tweet.tweet,tweet.date_time AS dateTime FROM tweet NATURAL JOIN user
   WHERE user_id IN (${userIdList})
   ORDER BY tweet.date_time DESC
   LIMIT 4;`
  const searchData = await db.all(api3Query1)
  response.send(searchData)
})
app.get('/user/following/', authenticateToken, async (request, response) => {
  const username = request.username
  const api4Query = `SELECT following_user_id AS ids FROM user INNER JOIN follower 
  ON user.user_id=follower.follower_user_id WHERE username='${username}';`
  const userIdList = await db.all(api4Query)
  let nameList = []
  for (let item of userIdList) {
    const api4Query1 = `SELECT name FROM user WHERE user_id=${item.ids};`
    const names = await db.get(api4Query1)
    nameList.push(names)
  }
  response.send(nameList)
})
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const username = request.username
  const api5Query = `SELECT user.user_id AS id FROM user INNER JOIN follower 
  ON user.user_id=follower.follower_user_id WHERE username='${username}';`
  const userId = await db.get(api5Query)
  const api5Query1 = `SELECT name FROM user INNER JOIN follower 
  ON user.user_id=follower.follower_user_id WHERE following_user_id=${userId.id} ;`
  const names = await db.all(api5Query1)
  response.send(names)
})
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const username = request.username
  const {tweetId} = request.params
  const api6Query = `SELECT tweet.tweet_id as ids FROM (user INNER JOIN follower 
   ON user.user_id=follower.follower_user_id) AS T INNER JOIN tweet 
   ON T.following_user_id=tweet.user_id
  WHERE T.username='${username}';`
  const tweetIdList = await db.all(api6Query)
  let idList = []
  for (let item of tweetIdList) {
    idList.push(item.ids)
  }
  let tid = parseInt(tweetId)
  if (idList.includes(tid)) {
    const query1 = `SELECT tweet,date_time AS dateTime FROM tweet WHERE tweet_id=${tweetId};`
    const tweetList = await db.get(query1)
    const query2 = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${tweetId};`
    const nooflikes = await db.get(query2)
    const query3 = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${tweetId};`
    const noofreplies = await db.get(query3)
    response.send({
      tweet: tweetList.tweet,
      likes: nooflikes.likes,
      replies: noofreplies.replies,
      dateTime: tweetList.dateTime,
    })
  } else {
    response.status(401).send('Invalid Request')
  }
})
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const username = request.username
    const {tweetId} = request.params
    const api6Query = `SELECT tweet.tweet_id as ids FROM (user INNER JOIN follower 
   ON user.user_id=follower.follower_user_id) AS T INNER JOIN tweet 
   ON T.following_user_id=tweet.user_id
  WHERE T.username='${username}';`
    const tweetIdList = await db.all(api6Query)
    let idList = []
    for (let item of tweetIdList) {
      idList.push(item.ids)
    }
    let tid = parseInt(tweetId)
    if (idList.includes(tid)) {
      const api7query1 = `SELECT username AS unames  FROM user NATURAL JOIN like WHERE like.tweet_id=${tweetId}`
      const searchData = await db.all(api7query1)
      let nameList = []
      for (let name of searchData) {
        nameList.push(name.unames)
      }
      response.send({
        likes: nameList,
      })
    } else {
      response.status(401).send('Invalid Request')
    }
  },
)
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const username = request.username
    const {tweetId} = request.params
    const api8Query = `SELECT tweet.tweet_id as ids FROM (user INNER JOIN follower 
   ON user.user_id=follower.follower_user_id) AS T INNER JOIN tweet 
   ON T.following_user_id=tweet.user_id
  WHERE T.username='${username}';`
    const tweetIdList = await db.all(api8Query)
    let idList = []
    for (let item of tweetIdList) {
      idList.push(item.ids)
    }
    let tid = parseInt(tweetId)
    if (idList.includes(tid)) {
      const api8query1 = `SELECT user.name,reply.reply  FROM user NATURAL JOIN reply WHERE reply.tweet_id=${tweetId}`
      const searchData = await db.all(api8query1)
      response.send({
        replies: searchData,
      })
    } else {
      response.status(401).send('Invalid Request')
    }
  },
)
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const username = request.username
  const api9Query = `SELECT user.user_id FROM user WHERE username='${username}';`
  const userId = await db.get(api9Query)
  const id = userId.user_id
  const query1 = `SELECT tweet_id FROM tweet WHERE user_id=${id};`
  const tweetList = await db.all(query1)
  let tweetidList = []
  for (let item of tweetList) {
    tweetidList.push(item.tweet_id)
  }
  let userTweets = []
  for (let eachid of tweetidList) {
    const query1 = `SELECT tweet,date_time AS dateTime FROM tweet WHERE tweet_id=${eachid};`
    const eachtweetList = await db.get(query1)
    const query2 = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${eachid};`
    const nooflikes = await db.get(query2)
    const query3 = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id=${eachid};`
    const noofreplies = await db.get(query3)
    userTweets.push({
      tweet: eachtweetList.tweet,
      likes: nooflikes.likes,
      replies: noofreplies.replies,
      dateTime: eachtweetList.dateTime,
    })
  }
  response.send(userTweets)
})
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const username = request.username
  const {tweet} = request.body
  const api10Query = `SELECT user.user_id FROM user WHERE username='${username}';`
  const userId = await db.get(api10Query)
  const id = userId.user_id
  const api10Query1 = `INSERT INTO tweet(tweet,user_id) 
  VALUES('${tweet}',${id});`
  await db.run(api10Query1)
  response.send('Created a Tweet')
})
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const username = request.username
    const {tweetId} = request.params
    const api11Query = `SELECT user.user_id FROM user WHERE username='${username}';`
    const userId = await db.get(api11Query)
    const id = userId.user_id
    const query1 = `SELECT tweet_id FROM tweet WHERE user_id=${id};`
    const tweetList = await db.all(query1)
    let tweetidList = []
    for (let item of tweetList) {
      tweetidList.push(item.tweet_id)
    }
    const tid = parseInt(tweetId)
    if (tweetidList.includes(tid)) {
      const api11Query1 = `DELETE FROM tweet WHERE tweet_id=${tweetId};`
      await db.run(api11Query1)
      response.send('Tweet Removed')
    } else {
      response.status(401).send('Invalid Request')
    }
  },
)
module.exports = app
