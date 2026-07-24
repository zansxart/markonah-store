import { MongoClient } from 'mongodb'

export class mongoDB {
  /**
   * @param {string} url - MongoDB connection string
   */
  constructor(url) {
    if (typeof url !== 'string') throw new Error('MongoDB URL is required')
    this.url = url
    this.client = new MongoClient(this.url)
    this.db = null
    this.collection = null
    this.data = {}
    this._data = null
  }

  async read() {
    if (!this.client.isConnected?.()) await this.client.connect()
    
    this.db = this.client.db() // default DB from URI
    this.collection = this.db.collection('data')

    const doc = await this.collection.findOne({})
    if (!doc) {
      const init = { data: {} }
      await this.collection.insertOne(init)
      this._data = await this.collection.findOne({})
    } else {
      this._data = doc
    }

    this.data = this._data.data || {}
    return this.data
  }

  async write(data) {
    if (!data) throw new Error('No data provided')
    if (!this.collection) throw new Error('Database not initialized. Call read() first.')

    if (!this._data?._id) {
      const result = await this.collection.insertOne({ data })
      this._data = await this.collection.findOne({ _id: result.insertedId })
    } else {
      await this.collection.updateOne(
        { _id: this._data._id },
        { $set: { data } }
      )
      this._data = await this.collection.findOne({ _id: this._data._id })
    }

    this.data = data
    return this._data
  }
}
