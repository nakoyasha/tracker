export default async function mapIteratorToArray(map: Map<any, any>) {
    const keys = map.keys()
    const array = []

    for await (let key of keys) {
        console.log(key)
        array.push(key)
    }

    return array
}