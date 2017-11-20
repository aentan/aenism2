var gulp         = require("gulp"),
    concat       = require('gulp-concat'),
    sass         = require("gulp-sass"),
    autoprefixer = require("gulp-autoprefixer"),
    hash         = require("gulp-hash"),
    del          = require("del"),
    svgmin       = require('gulp-svgmin'),
    imagemin     = require('gulp-imagemin'),
    imageResize  = require('gulp-image-resize'),
    uglify       = require('gulp-uglify'),
    cssmin       = require('gulp-cssmin'),
    changed      = require('gulp-changed')
    // gzip         = require('gulp-gzip')

// Compile SCSS files to CSS
gulp.task("scss", function () {

    //Delete our old css files
    del(["static/css/**/*"])

    //compile hashed css files
    gulp.src(["static/vendor/css/**/*", "static/src/scss/main.scss"])
        .pipe(sass({
            outputStyle : "compressed"
        }))
        .pipe(autoprefixer({
            browsers : ["last 20 versions"]
        }))
        .pipe(concat('main.css'))
        .pipe(cssmin())
        // .pipe(gzip())
        .pipe(hash())
        .pipe(gulp.dest("static/css"))
        //Create a hash map
        .pipe(hash.manifest("hash.json"))
        //Put the map in the data directory
        .pipe(gulp.dest("data/css"))

    //Delete our old css files
    del(["static/demo/css/*"])

    //compile hashed css files
    gulp.src(["static/demo/src/css/*"])
        .pipe(sass({
            outputStyle : "compressed"
        }))
        .pipe(autoprefixer({
            browsers : ["last 20 versions"]
        }))
        .pipe(cssmin())
        // .pipe(gzip())
        .pipe(hash())
        .pipe(gulp.dest("static/demo/css"))
        //Create a hash map
        .pipe(hash.manifest("hash.json"))
        //Put the map in the data directory
        .pipe(gulp.dest("data/demo/css"))
})

gulp.task("img", function () {
    gulp.src("static/src/img/previews/**/*")
        .pipe(imageResize({
          width   : 128,
          height  : 128,
          cover   : true,
          crop    : true
        }))
        .pipe(gulp.dest("static/img/previews"))

    gulp.src("static/src/img/**/*")
        .pipe(changed("static/img"))
        .pipe(imagemin())
        // .pipe(gzip())
        .pipe(gulp.dest("static/img"))

    gulp.src("static/demo/src/img/**/*")
        .pipe(imagemin())
        // .pipe(gzip())
        .pipe(gulp.dest("static/demo/img"))
})

// Hash SVG
gulp.task("svg", function () {
    del(["static/svg/**/*"])
    gulp.src("static/src/svg/**/*")
        .pipe(svgmin())
        // .pipe(hash())
        .pipe(gulp.dest("layouts/partials/svg"))
        // .pipe(hash.manifest("hash.json"))
        //.pipe(gulp.dest("data/img"))
})

// Hash javascript
gulp.task("js", function () {
    del(["static/js/**/*"])
    gulp.src(["static/vendor/js/**/*", "static/src/js/**/*"])
        .pipe(concat('main.js'))
        .pipe(uglify())
        // .pipe(gzip())
        .pipe(hash())
        .pipe(gulp.dest("static/js"))
        .pipe(hash.manifest("hash.json"))
        .pipe(gulp.dest("data/js"))

    del(["static/demo/js/**/*"])
    gulp.src(["static/demo/src/js/**/*"])
        .pipe(concat('main.js'))
        .pipe(uglify())
        // .pipe(gzip())
        .pipe(hash())
        .pipe(gulp.dest("static/demo/js"))
        .pipe(hash.manifest("hash.json"))
        .pipe(gulp.dest("data/demo/js"))
})

// Watch asset folder for changes
gulp.task("watch", ["scss", "img", "svg", "js"], function () {
    gulp.watch(["static/vendor/css/**/*", "static/src/scss/**/*", "static/demo/src/css/*"], ["scss"])
    gulp.watch("static/src/img/**/*", ["img"])
    gulp.watch("static/src/svg/**/*", ["svg"])
    gulp.watch(["static/vendor/js/**/*", "static/src/js/**/*"], ["js"])
})

// Set watch as default task
gulp.task("default", ["watch"])