/*
TODO:
 - light up neighbors that caused a tile to be destroyed
 - make tiles nice and rounded
   - and valign middle
 - maybe require at least X tiles to start game - otherwise, 70k bonus might be too easy
 - sometimes clicks on the board don't register
 - maybe make the #board element catch clicks, and calculate the position?
 - "Chain 2x" indicator
 - BUG - when there's still turns left, but the board is filled up, game doesn't realize it's a "game over" condition
  - to properly test this, need to add some functions that alow me to populate a board with custom tiles.



LOOP:
// drop tile
// loop:
//   destroy tiles
//   collapse tiles
// increment turn
// check for endgame
// create droptile


*/

Number.prototype.commas = function() {
    var s = this + "";
    var result = '';
    while (s.length > 3) {
        result = "," + s.slice(-3) + result;
        s = s.slice(0, -3);
    }
    return s + result;
}

ROWS = 7;
COLS = 7;
VALUES = 7;

SCORES = [7, 39, 109, 224, 391, 617, 907, 1267, 1701, 2213, 2809, 3491, 4265, 5133, 6099, 7168, 8341, 9622, 11014, 12521, 14146, 15891, 17758, 19752, 21875, 24128, 26515, 29039, 31702, 34506]
CLEAR_BONUS = 70000;
LEVEL_BONUS = 17000;

ANIM_DROPTILE_HORIZONTAL = 33;
ANIM_DROPTILE_VERTICAL = 33;
ANIM_DESTROY = 200;
ANIM_COLLAPSE = 33;
ANIM_MOVEUP = 200;
ANIM_SCOREFLOAT = 1000;

function reset() {
    level = 1; // current level
    turns = 5; // turns left on this level
    score = 0; // user's current score
    chain = 0; // user's current chain
    longest_chain = 0; // longest chain achieved during this game

    tiles = [];
    board = new BOARD();
    droptile = null;

    // create backdrop
    $("#board").html("");
    for(var row = ROWS-1; row >= 0; row--) {
        for(var col = 0; col < COLS; col++) {
            $('<div class="cell" data-col="'+col+'" data-row="'+row+'"></div>').appendTo("#board");
        }
    }

}

function start_game() {
    reset(); // clean slate

    // Populate the board with random tiles
    var tile_count = Math.floor(Math.random() * 25);

    for(var i=0; i<tile_count; i++) {
        var col = Math.floor(Math.random() * COLS);
        for(var row = 0; row < ROWS && board.val(row, col) != 0; row++);
        if (row == ROWS) { i--; tile_count--; continue; } // this column is full
        var val = Math.ceil(Math.random() * VALUES);
        board.addTile( new TILE(row, col, val) );
    }

    // destroy and collapse the tiles as necessary, if any are collapsible
    do {
        var destroyable = board.getDestroyableTiles();
        $.each(destroyable, function(i, tile) { tile.destroy(); } );
        var collapsible = board.getCollapsibleTiles();
        $.each(collapsible, function(i, tile) { tile.row -= tile.collapsible(); } );
    } while (destroyable.length > 0 || collapsible.length > 0);

    // draw the board
    board.draw();

    // create a tile that's ready to be dropped.
    create_droptile();
}

function create_droptile() {
    // create a tile that's ready to be dropped.
    droptile = new TILE(ROWS, Math.floor(COLS / 2), Math.ceil(Math.random() * VALUES));
    droptile.draw();

    // reset chain counter
    chain = 0;

    // listen for user dropping
    allow_clicks();
}

function allow_clicks() {
    $('div.cell').on('click', drop);
    $('div.tile').on('click', drop);
}
function forbid_clicks() {
    $('div.cell').off('click');
    $('div.tile').off('click');
}

function drop() {
    forbid_clicks();

    var col = $(this).data('col');
    var row = $(this).data('row');
    var destination = board.getColumnHeight(col);

    // did player click on the drop tile itself?
    if (row == ROWS) {
        //console.log("Player clicked on the drop tile itself",this,"so ignore.");
        allow_clicks();
        return;
    }

    //console.log("Player clicked on column", col, 'will be shoving into', destination);

    // is column full?
    if (destination >= ROWS) {
        //console.log("Column",col,"is full.");
        allow_clicks();
        return;
    }

    // Place droptile onto the board
    board.addTile(droptile);

    // animate droptile
    droptile.element
        .animate( { left: col * 31, }, ANIM_DROPTILE_HORIZONTAL * Math.abs(droptile.col - col))
        .animate( { bottom: destination * 31, }, ANIM_DROPTILE_VERTICAL * Math.abs(droptile.row - destination))
        .promise().done( function() {
            //console.log("Done animating drop");
            droptile.row = destination;
            droptile.col = col;
            droptile.update();

            destroy_tiles();
        });

    // IF we just occupied the last slot on the board, game over.
    if (board.isFull()) {
        game_over();
    }
}

function destroy_tiles(no_increment) {
    if (typeof(no_increment) == "undefined") { no_increment = false; }

    // destroy tiles
    var destroyable = board.getDestroyableTiles();
    var wait = $.Deferred();
    var destroyed = 0;

    //console.log("There are", destroyable.length, "tiles waiting to be destroyed in chain", chain);
    if (destroyable.length == 0) {
        wait.resolve();
    }

    wait.progress( function(notification) {
        if (++destroyed >= destroyable.length) { wait.resolve(); }
    }).done( function() {
        // if there are any collapsible tiles, call collapse_tiles
        // if there are any destroyable tiles, call destroy_tiles
        // otherwise, increment turn.

        //console.log("We are done destroying tiles");
        if (destroyable.length > 0) {
            // some tiles were destroyed; increment chain
            chain++;
            longest_chain = Math.max(chain, longest_chain);
        }

        if (board.getCollapsibleTiles().length > 0) {
            //console.log("There exist collapsible tiles on the board.");
            collapse_tiles(no_increment);
        } else if (board.getDestroyableTiles().length > 0) {
            //console.log("There exist destroyable tiles on the board.");
            destroy_tiles(no_increment);
        } else if (no_increment) {
            // we are just checking for destruction after a level increase
            //console.log("Creating a new droptile after level increment");
            create_droptile();
        } else {
            //console.log("Incrementing turn.");
            increment_turn();
        }
    } );

    $.each(destroyable, function(i, tile) {
        // animate a floating-upward score
        var floating_score = $("<div></div>")
            .addClass('floating_score')
            .css('color', tile.element.css('background-color'))
            .html("+" + SCORES[chain])
            .appendTo("#board")
            .css('left', tile.element.css('left'))
            .css('bottom', tile.element.css('bottom'))
            .animate( { bottom: '+=30', }, 0)
            .animate( { bottom: '+=50', opacity: 0, }, ANIM_SCOREFLOAT )
            .promise()
            .done( function() {
                $(this).remove();
            });

        // animate this tile's destruction
        tile.element
            .animate( { width: '+=10', height: '+=10', left: '-=5', bottom: '-=5', }, ANIM_DESTROY )
            .animate( { width: '-=10', height: '-=10', left: '+=5', bottom: '+=5', opacity: 0, }, ANIM_DESTROY )
            .promise()
            .done( function() {
                tile.destroy();

                // increment the score
                //console.log("Incrementing score by", SCORES[chain],"for chain",chain);
                score += SCORES[chain];
                update_ui();

                // notify the Deferred object wait that we are done with a tile
                wait.notify("Hey, tile" + tile + " is done being destroyed now");

            } );

    });


}

function collapse_tiles(no_increment) {
    if (typeof(no_increment) == "undefined") { no_increment = false; }

    // collapse tiles
    var collapsible = board.getCollapsibleTiles();
    var wait = $.Deferred();
    var collapsed = 0;

    //console.log("There are", collapsible.length, "tiles waiting to be collapsed in chain", chain);
    if (collapsible.length == 0) {
        wait.resolve();
    }

    wait.progress( function(notification) {
        if (++collapsed >= collapsible.length) { wait.resolve(); }
    }).done( function() {
        // if there are any collapsible tiles, call collapse_tiles
        //console.log("We are done collapsing tiles");
        if (board.getDestroyableTiles().length > 0) {
            //console.log("There exist destroyable tiles on the board.");
            destroy_tiles(no_increment);
        } else if (no_increment) {
            // we are just checking for destruction after a level increase
            //console.log("Creating a new droptile after level increment");
            create_droptile();
        } else {
            //console.log("Incrementing turn.");
            increment_turn();
        }
    } );

    $.each(collapsible, function(i, tile) {
        // animate this tile's collapse
        var distance = tile.collapsible();
        var row = tile.row - distance;
        tile.element
            .animate( { bottom: row * 31, }, ANIM_COLLAPSE * distance )
            .promise()
            .done( function() {
                // update the tile's new row
                tile.row = row;
                // update HTML element data
                tile.update();
                // notify the Deferred object wait that we are done with a tile
                wait.notify("Hey, tile" + tile + " is done being collapsed now");
            } );
    });
}

function increment_turn() {
    // if board is empty, award bonus
    if (tiles.length == 0) {
        score += CLEAR_BONUS;
    }

    // decrement turn
    turns--;

    if (turns > 0) {
        update_ui();
        create_droptile();
    } else {
        // if end of level reached, increase level
        level++;
        turns = 5;
        score += LEVEL_BONUS;
        update_ui();

        // add tiles
        for(var col = 0; col < COLS; col++) {
            board.addTile(new TILE(-1, col, -2));
        }

        // animate all tiles upward
        var wait = $.Deferred();
        var moved = 0;

        $.each(tiles, function(i, tile) {
            tile.draw();
            tile.element
                .animate( { bottom: (tile.row + 1) * 31, }, ANIM_MOVEUP)
                .promise()
                .done( function() {
                    // update the tile's new row
                    tile.row++;
                    // update HTML element data
                    tile.update();
                    // notify the Deferred object wait that we are done with a tile
                    wait.notify("Hey, tile" + tile + " is done being moved up now");
                });
        });

        wait.progress( function(notification) {
            if (++moved >= tiles.length) { wait.resolve(); }
        }).done( function() {
            //console.log("We are done moving tiles up");

            // check for endgame condition
            for(var col = 0; col < COLS; col++) {
                if (board.getColumnHeight(col) > COLS) {
                    return game_over();
                }
            }

            // destroy_tiles will take care of droptile creation.
            // which I really kind of hate. I think I've made this too complicated again.
            // will refactor, probably, never.
            destroy_tiles(true);

        } );
    }
}

function update_ui() {
    $("div#score").text(score.commas());
    $("div#level").text("Level " + level);
    $("div#turns span").css("color", "black");
    $("div#turns span:lt(" + turns + ")").css("color", "white");
}

function game_over() {
    forbid_clicks();



    game_count = parseInt(localStorage.game_count) || 0;
    average_score = parseInt(localStorage.average_score) || 0;

    new_average_score = Math.floor(((average_score * game_count) + score) / (game_count + 1));

    localStorage.average_score = new_average_score;
    localStorage.game_count = game_count + 1;

    $("#board").html("").append( $("#game_over").clone().show() );

    $("#board > table").find("tr#score td").text(score.commas());
    $("#board > table").find("tr#longest_chain td").text(longest_chain);
    $("#board > table").find("tr#level td").text(level);
    $("#board > table").find("tr#prev_average td").text(average_score.commas());
    $("#board > table").find("tr#new_average td").text(new_average_score.commas());
    $("#board > table").find("tr#new_average td").append('<span id="arrow">');
    if (new_average_score > average_score) {
        $("#board > table span#arrow").addClass("up");
    } else {
        $("#board > table span#arrow").addClass("down");
    }

}




$(document).ready( function() {
    start_game();
});
