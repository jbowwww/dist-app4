db.fs.aggregate([{
    $lookup: {
        from: 'fs',
        localField: 'dir',
        foreignField: '_id',
        as: 'dir'
    }
}, {
    $unwind: '$dir'
}, {
    $lookup: {
        from: 'partitions',
        localField: 'partition',
        foreignField: '_id',
        as: 'partition'
    }
}, {
    $unwind: '$partition'
}])