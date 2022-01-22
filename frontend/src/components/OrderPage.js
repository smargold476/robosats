import React, { Component } from "react";
import { Alert, Paper, CircularProgress, Button , Grid, Typography, List, ListItem, ListItemIcon, ListItemText, ListItemAvatar, Avatar, Divider, Box, LinearProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle} from "@mui/material"
import Countdown, { zeroPad, calcTimeDelta } from 'react-countdown';
import TradeBox from "./TradeBox";
import getFlags from './getFlags'

// icons
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import NumbersIcon from '@mui/icons-material/Numbers';
import PriceChangeIcon from '@mui/icons-material/PriceChange';
import PaymentsIcon from '@mui/icons-material/Payments';
import MoneyIcon from '@mui/icons-material/Money';
import ArticleIcon from '@mui/icons-material/Article';
import ContentCopy from "@mui/icons-material/ContentCopy";

function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== '') {
      const cookies = document.cookie.split(';');
      for (let i = 0; i < cookies.length; i++) {
          const cookie = cookies[i].trim();
          // Does this cookie string begin with the name we want?
          if (cookie.substring(0, name.length + 1) === (name + '=')) {
              cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
              break;
          }
      }
  }
  return cookieValue;
}
const csrftoken = getCookie('csrftoken');

// pretty numbers
function pn(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default class OrderPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
        isExplicit: false,
        delay: 60000, // Refresh every 60 seconds by default
        currencies_dict: {"1":"USD"},
        total_secs_exp: 300,
        loading: true,
        openCancel: false,
    };
    this.orderId = this.props.match.params.orderId;
    this.getCurrencyDict();
    this.getOrderDetails();

    // Refresh delais according to Order status
    this.statusToDelay = {
      "0": 3000,    //'Waiting for maker bond'
      "1": 30000,   //'Public'
      "2": 9999999, //'Deleted'
      "3": 3000,    //'Waiting for taker bond'
      "4": 9999999, //'Cancelled'
      "5": 999999,  //'Expired'
      "6": 3000,    //'Waiting for trade collateral and buyer invoice'
      "7": 3000,    //'Waiting only for seller trade collateral'
      "8": 10000,   //'Waiting only for buyer invoice'
      "9": 10000,   //'Sending fiat - In chatroom'
      "10": 15000,  //'Fiat sent - In chatroom'
      "11": 60000,  //'In dispute'
      "12": 9999999,//'Collaboratively cancelled'
      "13": 3000,   //'Sending satoshis to buyer'
      "14": 9999999,//'Sucessful trade'
      "15": 10000,  //'Failed lightning network routing'
      "16": 9999999,//'Maker lost dispute'
      "17": 9999999,//'Taker lost dispute'
    }
  }

  // Unneeded for the most part. Let's keep variable names as they come from the API
  // Will need some renaming everywhere, but will decrease the mess.
  completeSetState=(newStateVars)=>{
    console.log(newStateVars)
    var otherStateVars = {
      loading: false,
      delay: this.setDelay(newStateVars.status),
      currencyCode: this.getCurrencyCode(newStateVars.currency),
    };
    console.log(otherStateVars)
    var completeStateVars = Object.assign({}, newStateVars, otherStateVars);
    console.log(completeStateVars)
    this.setState(completeStateVars);
  //   {
  //     loading: false,
  //     delay: this.setDelay(data.status),
  //     id: data.id,
  //     status: data.status,
  //     status_message: data.status_message,
  //     type: data.type,
  //     currency: data.currency,
  //     currencyCode: this.getCurrencyCode(data.currency),
  //     amount: data.amount,
  //     payment_method: data.payment_method,
  //     isExplicit: data.is_explicit,
  //     premium: data.premium,
  //     satoshis: data.satoshis,
  //     makerId: data.maker, 
  //     is_participant: data.is_participant,
  //     urNick: data.ur_nick,
  //     maker_nick: data.maker_nick,
  //     takerId: data.taker,
  //     taker_nick: data.taker_nick,
  //     is_maker: data.is_maker,
  //     is_taker: data.is_taker,
  //     is_buyer: data.is_buyer,
  //     is_seller: data.is_seller,
  //     penalty: data.penalty,
  //     expires_at: data.expires_at,
  //     bad_request: data.bad_request,
  //     bond_invoice: data.bond_invoice,
  //     bondSatoshis: data.bond_satoshis,
  //     escrow_invoice: data.escrow_invoice,
  //     escrowSatoshis: data.escrow_satoshis,
  //     invoice_amount: data.invoice_amount,
  //     total_secs_exp: data.total_secs_exp,
  //     num_similar_orders: data.num_similar_orders,
  //     price_now: data.price_now,
  //     premium_now: data.premium_now,
  //     probots_in_book: data.robots_in_book,
  //     premium_percentile: data.premium_percentile,
  //     num_similar_orders: data.num_similar_orders
  // })
  }
  getOrderDetails() {
    this.setState(null)
    fetch('/api/order' + '?order_id=' + this.orderId)
      .then((response) => response.json())
      .then((data) => this.completeSetState(data));
  }

  // These are used to refresh the data
  componentDidMount() {
    this.interval = setInterval(this.tick, this.state.delay);
  }
  componentDidUpdate() {
    clearInterval(this.interval);
      this.interval = setInterval(this.tick, this.state.delay);
  }

  componentWillUnmount() {
    clearInterval(this.interval);
  }
  tick = () => {
    this.getOrderDetails();
  }

  // Fix to use proper react props
  handleClickBackButton=()=>{
    window.history.back();
  }

  // Countdown Renderer callback with condition 
  countdownRenderer = ({ total, hours, minutes, seconds, completed }) => {
  if (completed) {
    // Render a completed state
    return (<span> The order has expired</span>);

  } else {
    var col = 'black'
    var fraction_left = (total/1000) / this.state.total_secs_exp
    // Make orange at 25% of time left
    if (fraction_left < 0.25){col = 'orange'}
    // Make red at 10% of time left
    if (fraction_left < 0.1){col = 'red'}
    // Render a countdown, bold when less than 25%
    return (
      fraction_left < 0.25 ? <b><span style={{color:col}}>{hours}h {zeroPad(minutes)}m {zeroPad(seconds)}s </span></b>
      :<span style={{color:col}}>{hours}h {zeroPad(minutes)}m {zeroPad(seconds)}s </span>
    );
  }
  };

  LinearDeterminate =()=> {
    const [progress, setProgress] = React.useState(0);
  
    React.useEffect(() => {
      const timer = setInterval(() => {
        setProgress((oldProgress) => {
          var left = calcTimeDelta( new Date(this.state.expires_at)).total /1000;
          return (left / this.state.total_secs_exp) * 100;
        });
      }, 1000);
  
      return () => {
        clearInterval(timer);
      };
    }, []);
  
    return (
      <Box sx={{ width: '100%' }}>
        <LinearProgress variant="determinate" value={progress} />
      </Box>
    );
  }

  handleClickTakeOrderButton=()=>{
    console.log(this.state)
      const requestOptions = {
          method: 'POST',
          headers: {'Content-Type':'application/json', 'X-CSRFToken': getCookie('csrftoken'),},
          body: JSON.stringify({
            'action':'take',
          }),
      };
      fetch('/api/order/' + '?order_id=' + this.orderId, requestOptions)
      .then((response) => response.json())
      .then((data) => this.completeSetState(data));
  }
  getCurrencyDict() {
    fetch('/static/assets/currencies.json')
      .then((response) => response.json())
      .then((data) => 
      this.setState({
        currencies_dict: data
      }));
  }
  
  // set delay to the one matching the order status. If null order status, delay goes to 9999999.
  setDelay = (status)=>{
    return status >= 0 ? this.statusToDelay[status.toString()] : 99999999;
  }

  getCurrencyCode(val){
    let code = val ? this.state.currencies_dict[val.toString()] : "" 
    return code
  }

  handleClickConfirmCancelButton=()=>{
    console.log(this.state)
      const requestOptions = {
          method: 'POST',
          headers: {'Content-Type':'application/json', 'X-CSRFToken': getCookie('csrftoken'),},
          body: JSON.stringify({
            'action':'cancel',
          }),
      };
      fetch('/api/order/' + '?order_id=' + this.orderId, requestOptions)
      .then((response) => response.json())
      .then((data) => (console.log(data) & this.getOrderDetails(data.id)));
    this.handleClickCloseConfirmCancelDialog();
  }

  handleClickOpenConfirmCancelDialog = () => {
    this.setState({openCancel: true});
  };
  handleClickCloseConfirmCancelDialog = () => {
      this.setState({openCancel: false});
  };

  CancelDialog =() =>{
  return(
      <Dialog
      open={this.state.openCancel}
      onClose={this.handleClickCloseConfirmCancelDialog}
      aria-labelledby="cancel-dialog-title"
      aria-describedby="cancel-dialog-description"
      >
        <DialogTitle id="cancel-dialog-title">
          {"Cancel the order?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="cancel-dialog-description">
            If the order is cancelled now you will lose your bond.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={this.handleClickCloseConfirmCancelDialog} autoFocus>Go back</Button>
          <Button onClick={this.handleClickConfirmCancelButton}> Confirm Cancel </Button>
        </DialogActions>
      </Dialog>
    )
  }

  CancelButton = () => {

    // If maker and Waiting for Bond. Or if taker and Waiting for bond.
    // Simply allow to cancel without showing the cancel dialog. 
    if ((this.state.is_maker & this.state.status == 0) || this.state.is_taker & this.state.status == 3){
      return(
        <Grid item xs={12} align="center">
          <Button variant='contained' color='secondary' onClick={this.handleClickConfirmCancelButton}>Cancel</Button>
        </Grid>
      )}
    // If the order does not yet have an escrow deposited. Show dialog
    // to confirm forfeiting the bond
    if (this.state.status in [0,1,3,6,7]){
      return(
        <Grid item xs={12} align="center">
          <this.CancelDialog/>
          <Button variant='contained' color='secondary' onClick={this.handleClickOpenConfirmCancelDialog}>Cancel</Button>
        </Grid>
      )}
    
    // TODO If the escrow is Locked, show the collaborative cancel button.
    
    // If none of the above do not return a cancel button.
    return(null)
  }

  orderBox=()=>{
    return(
      <Grid container spacing={1}>
        <Grid item xs={12} align="center">
          <Typography component="h5" variant="h5">
          Order Details
          </Typography>
          <Paper elevation={12} style={{ padding: 8,}}>
          <List dense="true">
            <ListItem >
              <ListItemAvatar sx={{ width: 56, height: 56 }}>
                <Avatar 
                  alt={this.state.maker_nick} 
                  src={window.location.origin +'/static/assets/avatars/' + this.state.maker_nick + '.png'} 
                  />
              </ListItemAvatar>
              <ListItemText primary={this.state.maker_nick + (this.state.type ? " (Seller)" : " (Buyer)")} secondary="Order maker" align="right"/>
            </ListItem>
            <Divider />

            {this.state.is_participant ?
              <>
                {this.state.taker_nick!='None' ?
                  <>
                    <ListItem align="left">
                      <ListItemText primary={this.state.taker_nick + (this.state.type ? " (Buyer)" : " (Seller)")} secondary="Order taker"/>
                      <ListItemAvatar > 
                        <Avatar
                          alt={this.state.maker_nick} 
                          src={window.location.origin +'/static/assets/avatars/' + this.state.taker_nick + '.png'}
                          />
                      </ListItemAvatar>
                    </ListItem>
                    <Divider />               
                  </>: 
                  ""
                  }
                  <ListItem>
                    <ListItemIcon>
                      <ArticleIcon/>
                    </ListItemIcon>
                    <ListItemText primary={this.state.status_message} secondary="Order status"/>
                  </ListItem>
                  <Divider />
              </>
            :""
            }
            
            <ListItem>
              <ListItemIcon>
               {getFlags(this.state.currencyCode)}
              </ListItemIcon>
              <ListItemText primary={parseFloat(parseFloat(this.state.amount).toFixed(4))
                +" "+this.state.currencyCode} secondary="Amount"/>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <PaymentsIcon/>
              </ListItemIcon>
              <ListItemText primary={this.state.payment_method} secondary="Accepted payment methods"/>
            </ListItem>
            <Divider />

            {/* If there is live Price and Premium data, show it. Otherwise show the order maker settings */}
            <ListItem>
              <ListItemIcon>
                <PriceChangeIcon/>
              </ListItemIcon>
            {this.state.price_now? 
                <ListItemText primary={pn(this.state.price_now)+" "+this.state.currencyCode+"/BTC - Premium: "+this.state.premium_now+"%"} secondary="Price and Premium"/>
            :
              (this.state.isExplicit ? 
                <ListItemText primary={pn(this.state.satoshis)} secondary="Amount of Satoshis"/>
                :
                <ListItemText primary={parseFloat(parseFloat(this.state.premium).toFixed(2))+"%"} secondary="Premium over market price"/>
              )
            } 
            </ListItem>
            <Divider />

            <ListItem>
              <ListItemIcon>
                <NumbersIcon/>
              </ListItemIcon>
              <ListItemText primary={this.orderId} secondary="Order ID"/>
            </ListItem>
            <Divider />
            <ListItem>
              <ListItemIcon>
                <AccessTimeIcon/>
              </ListItemIcon>
              <ListItemText secondary="Expires in">
                <Countdown date={new Date(this.state.expires_at)} renderer={this.countdownRenderer} />
              </ListItemText>
            </ListItem>
            <this.LinearDeterminate />
            </List>
            
            {/* If the user has a penalty/limit */}
            {this.state.penalty ? 
            <>
              <Divider />
              <Grid item xs={12} align="center">
                <Alert severity="warning" sx={{maxWidth:360}}>
                  You cannot take an order yet! Wait {this.state.penalty} seconds 
                </Alert>  
              </Grid>
            </>
            : null} 

          </Paper>
        </Grid>

        {/* Participants can see the "Cancel" Button, but cannot see the "Back" or "Take Order" buttons */}
        {this.state.is_participant ? 
          <this.CancelButton/>
         :
          <>
            <Grid item xs={12} align="center">
              <Button variant='contained' color='primary' onClick={this.handleClickTakeOrderButton}>Take Order</Button>
            </Grid>
            <Grid item xs={12} align="center">
              <Button variant='contained' color='secondary' onClick={this.handleClickBackButton}>Back</Button>
            </Grid>
          </>
          }

      </Grid>
    )
  }
  
  orderDetailsPage (){
    return(
      this.state.bad_request ?
        <div align='center'>
          <Typography component="subtitle2" variant="subtitle2" color="secondary" >
            {this.state.bad_request}<br/>
          </Typography>
          <Button variant='contained' color='secondary' onClick={this.handleClickBackButton}>Back</Button>
        </div>
        :
        (this.state.is_participant ? 
          <Grid container xs={12} align="center" spacing={2}>
            <Grid item xs={6} align="left">
              {this.orderBox()}
            </Grid>
            <Grid item xs={6} align="left">
              <TradeBox data={this.state} completeSetState={this.completeSetState} />
            </Grid>
          </Grid>
          :
          <Grid item xs={12} align="center">
            {this.orderBox()}
          </Grid>)
    )
  }

  render (){
    return ( 
      // Only so nothing shows while requesting the first batch of data
      this.state.loading ? <CircularProgress /> : this.orderDetailsPage()
    );
  }
}
